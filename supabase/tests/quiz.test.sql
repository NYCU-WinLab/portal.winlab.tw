-- Live quiz (Kahoot-style) RLS / SECURITY DEFINER regression suite — runs
-- via `supabase test db`. Pins the things a player must never be able to
-- do: read quiz_questions.correct_index directly, learn whether their own
-- answer was right before the host reveals it (submit_quiz_answer returns
-- nothing, and quiz_answers/quiz_players.score stay hidden/unchanged until
-- reveal), or forge a score by calling the mutation RPCs out of turn / as
-- someone else.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(21);

-- ── seed (as superuser — bypasses RLS) ──────────────────────────────────────
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'), -- host
  ('55555555-5555-5555-5555-555555555555'); -- player
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('44444444-4444-4444-4444-444444444444', 'quiz-host@test.local', 'Host', false, '{}'),
  ('55555555-5555-5555-5555-555555555555', 'quiz-player@test.local', 'Player', false, '{}');

insert into public.quiz_sets (id, title, created_by) values
  ('66666666-6666-6666-6666-666666666666', 'Test Quiz', '44444444-4444-4444-4444-444444444444');

insert into public.quiz_questions
  (id, quiz_set_id, position, question_text, choices, correct_index, time_limit_seconds)
values
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 1,
   'Capital of Taiwan?', array['Taipei', 'Tainan', 'Taichung', 'Kaohsiung'], 0, 20);

-- session id, referenced throughout via this subquery (one session for the
-- whole test transaction, so it's always exactly this row).
-- (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')

-- ── impersonate host: create + start the session ────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

select public.create_quiz_session('66666666-6666-6666-6666-666666666666');

-- 1. a freshly created session starts in lobby
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'lobby',
  'a freshly created session starts in lobby'
);

-- ── impersonate player, before joining ──────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 2. a non-participant cannot read the current question
select throws_ok(
  $$ select * from public.get_current_question(
       (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
     ) $$,
  '42501',
  NULL,
  'a non-participant cannot call get_current_question'
);

-- 3. player joins with the room code and gets a quiz_players row
select public.join_quiz_session(
  (select room_code from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
);
select is(
  (select user_id from public.quiz_players
     where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')),
  '55555555-5555-5555-5555-555555555555'::uuid,
  'joining with the room code creates a quiz_players row for the caller'
);

-- 4. joining again is idempotent (no duplicate row)
select public.join_quiz_session(
  (select room_code from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
);
select is(
  (select count(*) from public.quiz_players
     where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')),
  1::bigint,
  'rejoining the same session does not create a second player row'
);

-- 5. a player cannot read quiz_questions directly (that's where correct_index
--    lives) — only the quiz's own author can, gameplay goes through
--    get_current_question().
select is(
  (select count(*) from public.quiz_questions where id = '77777777-7777-7777-7777-777777777777'),
  0::bigint,
  'a player cannot read quiz_questions directly (no answer-key leak)'
);

-- 6. a non-host cannot advance the session
select throws_ok(
  $$ select public.advance_quiz_session(
       (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
     ) $$,
  '42501',
  NULL,
  'a non-host cannot call advance_quiz_session'
);

-- ── impersonate host: start question 1 ──────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
select public.advance_quiz_session(
  (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
);

-- 7. the session is now on question 1
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'question',
  'advance_quiz_session moves a lobby session to the first question'
);

-- ── impersonate player: play the round ───────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 8. correct_index is hidden while the question is live
select is(
  (select correct_index from public.get_current_question(
     (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
   )),
  NULL,
  'get_current_question hides correct_index while status = question'
);

-- 9. the caller's own result is hidden too, before they've even answered
select is(
  (select my_is_correct from public.get_current_question(
     (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
   )),
  NULL,
  'get_current_question hides my_is_correct while status = question'
);

-- 10. submitting a (correct) answer succeeds. It returns void -- there's no
--     is_correct/points_awarded in the RPC response to leak in the first
--     place, which the next few assertions build on.
select lives_ok(
  $$ select public.submit_quiz_answer(
       (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
       '77777777-7777-7777-7777-777777777777',
       0
     ) $$,
  'submit_quiz_answer succeeds for a valid, first-time answer'
);

-- 11. before reveal, the answer row itself is not directly readable — not
--     even by the player who owns it
select is(
  (select count(*) from public.quiz_answers where question_id = '77777777-7777-7777-7777-777777777777'),
  0::bigint,
  'a player cannot read their own quiz_answers row before reveal'
);

-- 12. before reveal, the score has NOT been applied yet — scoring happens
--     inside reveal_quiz_answer, not submit_quiz_answer, so there is no
--     live-leaderboard window that would tip off a correct answer
select is(
  (select score from public.quiz_players
     where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
       and user_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'quiz_players.score is unchanged immediately after answering (pre-reveal)'
);

-- 13. answering the same question twice (still pre-reveal) is rejected
select throws_ok(
  $$ select public.submit_quiz_answer(
       (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
       '77777777-7777-7777-7777-777777777777',
       0
     ) $$,
  'P0001',
  NULL,
  'submitting an answer twice for the same question is rejected'
);

-- 14. a non-host cannot reveal the answer
select throws_ok(
  $$ select public.reveal_quiz_answer(
       (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
     ) $$,
  '42501',
  NULL,
  'a non-host cannot call reveal_quiz_answer'
);

-- ── impersonate host: reveal ─────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
select public.reveal_quiz_answer(
  (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
);

-- 15. the session is now revealing the answer
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'reveal',
  'reveal_quiz_answer moves a question session to reveal'
);

-- 16. reveal applied points earned this round to the player's score
select cmp_ok(
  (select score from public.quiz_players
     where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
       and user_id = '55555555-5555-5555-5555-555555555555'),
  '>', 0,
  'the player''s score increased once the host revealed the answer'
);

-- ── impersonate player again ─────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 17. correct_index is now visible
select is(
  (select correct_index from public.get_current_question(
     (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
   )),
  0::smallint,
  'get_current_question reveals correct_index once status = reveal'
);

-- 18. and so is the caller's own result
select is(
  (select my_is_correct from public.get_current_question(
     (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
   )),
  true,
  'get_current_question reveals my_is_correct once status = reveal'
);

-- 19. now that it's revealed, the player can read their own quiz_answers row.
--     now() is frozen for the whole test transaction (transaction_timestamp
--     semantics), so question_started_at and the submit-time "now()" are
--     identical -- zero elapsed time -- which is why this is the max score.
select is(
  (select points_awarded from public.quiz_answers
     where question_id = '77777777-7777-7777-7777-777777777777'
       and player_id = (select id from public.quiz_players
                           where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
                             and user_id = '55555555-5555-5555-5555-555555555555')),
  1000,
  'quiz_answers is readable post-reveal and carries the server-computed points'
);

-- 20. quiz_sessions has no INSERT policy — direct writes are denied
select throws_ok(
  $$ insert into public.quiz_sessions (quiz_set_id, host_id, room_code)
     values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'ZZZZZZ') $$,
  '42501',
  NULL,
  'direct INSERT into quiz_sessions is denied by RLS (no insert policy)'
);

-- 21. quiz_players has no UPDATE policy — a direct score rewrite is a silent
--     no-op (RLS matches 0 rows), the same append-only shape as game_scores.
update public.quiz_players set score = 999999
  where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
    and user_id = '55555555-5555-5555-5555-555555555555';
select cmp_ok(
  (select score from public.quiz_players
     where session_id = (select id from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666')
       and user_id = '55555555-5555-5555-5555-555555555555'),
  '<>', 999999,
  'a direct UPDATE of quiz_players.score is a no-op (no update policy)'
);

select * from finish();
rollback;
