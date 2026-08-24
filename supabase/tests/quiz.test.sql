-- Live quiz (Kahoot-style) RLS / SECURITY DEFINER regression suite — runs
-- via `supabase test db`. Pins the things a player must never be able to
-- do: read quiz_questions.correct_index directly, learn whether their own
-- answer was right before the host reveals it (submit_quiz_answer returns
-- nothing, and quiz_answers/quiz_players.score stay hidden/unchanged until
-- reveal), or forge a score by calling the mutation RPCs out of turn / as
-- someone else. Also pins the quiz_session_questions snapshot: it's not
-- readable by anyone until the session ends, and it stays correct even if
-- the source quiz_questions is edited after the session started.
--
-- quiz_test_session is a plain (non-RLS) temp table snapshotting the
-- session id/room code right after the host creates it. It exists because
-- quiz_sessions_select itself is RLS-gated to the host or an already-joined
-- participant -- a non-participant player genuinely cannot query
-- quiz_sessions to discover the room code (that's the point: in the real
-- app they learn it out-of-band, from the host's screen), so the test
-- can't re-derive these values by querying quiz_sessions once it starts
-- impersonating the player. quiz_test_question captures the *snapshotted*
-- question ids the same way the real app does: by calling
-- get_current_question() once each question is live, not by reading
-- quiz_session_questions directly (which is RLS-gated to 'ended' sessions).

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(33);

-- ── seed (as superuser — bypasses RLS) ──────────────────────────────────────
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'), -- host (also the quiz set's author)
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
   'Capital of Taiwan?', array['Taipei', 'Tainan', 'Taichung', 'Kaohsiung'], 0, 20),
  ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 2,
   '1+1=?', array['1', '2', '3', '4'], 1, 20);

create temp table quiz_test_question (q1_id uuid, q2_id uuid);
insert into quiz_test_question default values;

-- ── impersonate host: create the session (snapshots both questions) ────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

select public.create_quiz_session('66666666-6666-6666-6666-666666666666');

create temp table quiz_test_session as
select id as session_id, room_code
from public.quiz_sessions
where quiz_set_id = '66666666-6666-6666-6666-666666666666';

-- 1. a freshly created session starts in lobby
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'lobby',
  'a freshly created session starts in lobby'
);

-- 2. the snapshot isn't readable yet, not even by the host -- only 'ended'
--    sessions unlock quiz_session_questions
select is(
  (select count(*) from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session)),
  0::bigint,
  'the host cannot read quiz_session_questions before the session ends'
);

-- ── impersonate player, before joining ──────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 3. a non-participant cannot read the current question
select throws_ok(
  $$ select * from public.get_current_question(
       (select session_id from quiz_test_session)
     ) $$,
  '42501',
  NULL,
  'a non-participant cannot call get_current_question'
);

-- 4. player joins with the room code and gets a quiz_players row
select public.join_quiz_session((select room_code from quiz_test_session));
select is(
  (select user_id from public.quiz_players
     where session_id = (select session_id from quiz_test_session)),
  '55555555-5555-5555-5555-555555555555'::uuid,
  'joining with the room code creates a quiz_players row for the caller'
);

-- 5. joining again is idempotent (no duplicate row)
select public.join_quiz_session((select room_code from quiz_test_session));
select is(
  (select count(*) from public.quiz_players
     where session_id = (select session_id from quiz_test_session)),
  1::bigint,
  'rejoining the same session does not create a second player row'
);

-- 6. a player cannot read quiz_questions directly (that's where correct_index
--    lives) — only the quiz's own author can, gameplay goes through
--    get_current_question().
select is(
  (select count(*) from public.quiz_questions where id = '77777777-7777-7777-7777-777777777777'),
  0::bigint,
  'a player cannot read quiz_questions directly (no answer-key leak)'
);

-- 7. the snapshot isn't readable pre-game either, as a participant
select is(
  (select count(*) from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session)),
  0::bigint,
  'a participant cannot read quiz_session_questions before the session ends'
);

-- 8. a non-host cannot advance the session
select throws_ok(
  $$ select public.advance_quiz_session(
       (select session_id from quiz_test_session)
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
select public.advance_quiz_session((select session_id from quiz_test_session));

-- 9. the session is now on question 1
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'question',
  'advance_quiz_session moves a lobby session to the first question'
);

-- ── impersonate player: play round 1 ─────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 10. correct_index is hidden while the question is live
select is(
  (select correct_index from public.get_current_question(
     (select session_id from quiz_test_session)
   )),
  NULL,
  'get_current_question hides correct_index while status = question'
);

-- 11. the caller's own result is hidden too, before they've even answered
select is(
  (select my_is_correct from public.get_current_question(
     (select session_id from quiz_test_session)
   )),
  NULL,
  'get_current_question hides my_is_correct while status = question'
);

-- capture the snapshotted id for question 1 the way the real app does: from
-- get_current_question's response, not by reading quiz_session_questions.
update quiz_test_question
set q1_id = (select question_id from public.get_current_question(
  (select session_id from quiz_test_session)
));

-- 12. the snapshot table itself is still not readable mid-question
select is(
  (select count(*) from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session)),
  0::bigint,
  'quiz_session_questions is not readable while status = question'
);

-- 13. submitting a (correct) answer succeeds. It returns void -- there's no
--     is_correct/points_awarded in the RPC response to leak in the first
--     place, which the next few assertions build on.
select lives_ok(
  $$ select public.submit_quiz_answer(
       (select session_id from quiz_test_session),
       (select q1_id from quiz_test_question),
       0::smallint
     ) $$,
  'submit_quiz_answer succeeds for a valid, first-time answer'
);

-- 14. before reveal, the answer row itself is not directly readable — not
--     even by the player who owns it
select is(
  (select count(*) from public.quiz_answers
     where question_id = (select q1_id from quiz_test_question)),
  0::bigint,
  'a player cannot read their own quiz_answers row before reveal'
);

-- 15. before reveal, the score has NOT been applied yet — scoring happens
--     inside reveal_quiz_answer, not submit_quiz_answer, so there is no
--     live-leaderboard window that would tip off a correct answer
select is(
  (select score from public.quiz_players
     where session_id = (select session_id from quiz_test_session)
       and user_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'quiz_players.score is unchanged immediately after answering (pre-reveal)'
);

-- 16. answering the same question twice (still pre-reveal) is rejected
select throws_ok(
  $$ select public.submit_quiz_answer(
       (select session_id from quiz_test_session),
       (select q1_id from quiz_test_question),
       0::smallint
     ) $$,
  'P0001',
  NULL,
  'submitting an answer twice for the same question is rejected'
);

-- 17. a non-host cannot reveal the answer
select throws_ok(
  $$ select public.reveal_quiz_answer(
       (select session_id from quiz_test_session)
     ) $$,
  '42501',
  NULL,
  'a non-host cannot call reveal_quiz_answer'
);

-- ── impersonate host: reveal question 1 ──────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
select public.reveal_quiz_answer((select session_id from quiz_test_session));

-- 18. the session is now revealing question 1's answer
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'reveal',
  'reveal_quiz_answer moves a question session to reveal'
);

-- 19. the snapshot is *still* not readable at 'reveal' -- only 'ended'
--     unlocks it, not merely "not mid-question"
select is(
  (select count(*) from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session)),
  0::bigint,
  'quiz_session_questions is not readable at status = reveal either'
);

-- 20. reveal applied points earned this round to the player's score
select cmp_ok(
  (select score from public.quiz_players
     where session_id = (select session_id from quiz_test_session)
       and user_id = '55555555-5555-5555-5555-555555555555'),
  '>', 0,
  'the player''s score increased once the host revealed the answer'
);

-- Tamper with the *original* quiz_questions row now that round 1 is over,
-- as the quiz set's own author (the host, in this seed) -- proves the
-- snapshot really is an independent copy and not a live reference: the
-- history assertions after the game ends (28-29) check the *original*
-- text, which this UPDATE should NOT have touched.
update public.quiz_questions
set question_text = 'TAMPERED -- should never appear in quiz_session_questions'
where id = '77777777-7777-7777-7777-777777777777';

-- ── impersonate player again ─────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 21. correct_index is now visible for question 1
select is(
  (select correct_index from public.get_current_question(
     (select session_id from quiz_test_session)
   )),
  0::smallint,
  'get_current_question reveals correct_index once status = reveal'
);

-- 22. and so is the caller's own result
select is(
  (select my_is_correct from public.get_current_question(
     (select session_id from quiz_test_session)
   )),
  true,
  'get_current_question reveals my_is_correct once status = reveal'
);

-- 23. now that it's revealed, the player can read their own quiz_answers row
--     and it carries the max score (now() is frozen for the whole test
--     transaction, so elapsed time is always zero).
select is(
  (select points_awarded from public.quiz_answers
     where question_id = (select q1_id from quiz_test_question)),
  1000,
  'quiz_answers is readable post-reveal and carries the server-computed points'
);

-- ── impersonate host: advance to question 2 ──────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
select public.advance_quiz_session((select session_id from quiz_test_session));

-- 24. the session is now on question 2
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'question',
  'advance_quiz_session moves a reveal session to the next question'
);

-- ── impersonate player: answer question 2 incorrectly ────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
update quiz_test_question
set q2_id = (select question_id from public.get_current_question(
  (select session_id from quiz_test_session)
));

-- 25. submitting a wrong answer still succeeds (rejection is only for
--     timing/turn violations, not for picking the "wrong" choice)
select lives_ok(
  $$ select public.submit_quiz_answer(
       (select session_id from quiz_test_session),
       (select q2_id from quiz_test_question),
       0::smallint
     ) $$,
  'submit_quiz_answer succeeds for an incorrect answer'
);

-- ── impersonate host: reveal + end the game ──────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
select public.reveal_quiz_answer((select session_id from quiz_test_session));

-- 26. the session is revealing question 2
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'reveal',
  'reveal_quiz_answer moves the second question to reveal'
);

select public.advance_quiz_session((select session_id from quiz_test_session));

-- 27. advancing past the last question ends the session
select is(
  (select status from public.quiz_sessions where quiz_set_id = '66666666-6666-6666-6666-666666666666'),
  'ended',
  'advancing past the last question ends the session'
);

-- 28. the wrong answer to question 2 earned zero points, so the player's
--     final score is exactly question 1's 1000 -- both computed
--     server-side, never from client input
select is(
  (select score from public.quiz_players
     where session_id = (select session_id from quiz_test_session)
       and user_id = '55555555-5555-5555-5555-555555555555'),
  1000,
  'final score reflects only the correct answer (1000), not the wrong one'
);

-- ── impersonate player: read the finished session's history ─────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);

-- 29. now that the session has ended, the full snapshot is readable
select is(
  (select count(*) from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session)),
  2::bigint,
  'quiz_session_questions is readable once the session has ended'
);

-- 30. question 1's snapshotted text is the ORIGINAL text -- proves the
--     snapshot is an independent copy, unaffected by the tamper above
select is(
  (select question_text from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session) and position = 1),
  'Capital of Taiwan?',
  'the snapshot keeps the original question text even after the source quiz_questions row was edited'
);

-- 31. question 2's snapshotted correct_index matches the original quiz
select is(
  (select correct_index from public.quiz_session_questions
     where session_id = (select session_id from quiz_test_session) and position = 2),
  1::smallint,
  'the snapshot preserves the correct answer for question 2'
);

-- 32. quiz_sessions has no INSERT policy — direct writes are denied
select throws_ok(
  $$ insert into public.quiz_sessions (quiz_set_id, host_id, room_code)
     values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'ZZZZZZ') $$,
  '42501',
  NULL,
  'direct INSERT into quiz_sessions is denied (no insert grant/policy)'
);

-- 33. quiz_players was only granted SELECT -- score only ever moves inside
--     reveal_quiz_answer, so a direct UPDATE is denied outright at the
--     privilege level, not just filtered to 0 rows by RLS.
select throws_ok(
  $$ update public.quiz_players set score = 999999
     where session_id = (select session_id from quiz_test_session)
       and user_id = '55555555-5555-5555-5555-555555555555' $$,
  '42501',
  NULL,
  'direct UPDATE of quiz_players.score is denied (no update grant)'
);

select * from finish();
rollback;
