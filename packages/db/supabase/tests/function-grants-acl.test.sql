-- Function grant regression suite for 20260924050258_tighten_function_grants
-- and 20260925051401_rls_helpers_authenticated_only — runs via
-- `supabase test db`.
--
-- Pins:
--   * anon (directly or through PUBLIC) holds no EXECUTE on the functions the
--     migration revoked, while authenticated and service_role still do.
--     has_function_privilege() resolves PUBLIC membership, so it catches the
--     "revoked from anon but still granted to PUBLIC" shape that a direct
--     aclexplode() grantee check misses (see 20260917122038).
--   * anon (directly or through PUBLIC) holds no EXECUTE on has_role and the
--     approve_* helpers either. 20260924050258 left those four in place
--     because RLS policies declared `to public` called them; 20260925051401
--     narrowed every such policy to `to authenticated` and then revoked them.
--     rls-helpers-authenticated.test.sql checks that no anon-applicable policy
--     calls them, so anon queries on those tables stay error-free.
--   * the quiz RPCs reject a request with no signed-in user (42501).
--   * a signed-in member who is not the host gets 'forbidden' from the host
--     actions.
--   * the real host can still drive a session: advance, read the question,
--     reveal.
--
-- Like meetings-function-acl.test.sql, this file does NOT run the suite-wide
-- `grant execute on all functions in schema public to authenticated;` — that
-- statement rewrites proacl, and the ACL assertions must see exactly what the
-- migrations left behind.

begin;
create extension if not exists pgtap with schema public;

select plan(31);

-- ═══ 1-16. ACL ═════════════════════════════════════════════════════════════
select ok(
  not has_function_privilege('anon', f::regprocedure, 'EXECUTE'),
  'anon cannot execute ' || f
)
from unnest(array[
  'public.get_current_question(uuid)',
  'public.advance_quiz_session(uuid)',
  'public.reveal_quiz_answer(uuid)',
  'public.get_game_leaderboard(public.game_type, smallint)'
]) f;

select ok(
  not exists (
    select 1
      from aclexplode((select proacl from pg_proc where oid = f::regprocedure)) a
     where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC holds no EXECUTE on ' || f
)
from unnest(array[
  'public.get_current_question(uuid)',
  'public.advance_quiz_session(uuid)',
  'public.reveal_quiz_answer(uuid)',
  'public.get_game_leaderboard(public.game_type, smallint)'
]) f;

select ok(
  has_function_privilege('authenticated', f::regprocedure, 'EXECUTE'),
  'authenticated can execute ' || f
)
from unnest(array[
  'public.get_current_question(uuid)',
  'public.advance_quiz_session(uuid)',
  'public.reveal_quiz_answer(uuid)',
  'public.get_game_leaderboard(public.game_type, smallint)'
]) f;

select ok(
  has_function_privilege('service_role', f::regprocedure, 'EXECUTE'),
  'service_role can execute ' || f
)
from unnest(array[
  'public.get_current_question(uuid)',
  'public.advance_quiz_session(uuid)',
  'public.reveal_quiz_answer(uuid)',
  'public.get_game_leaderboard(public.game_type, smallint)'
]) f;

-- ═══ 17-20. RLS helpers: revoked once their policies left anon ══════════════
select ok(
  not has_function_privilege('anon', f::regprocedure, 'EXECUTE'),
  'anon cannot execute ' || f
)
from unnest(array[
  'public.has_role(uuid, text, text)',
  'public.approve_doc_status(uuid)',
  'public.approve_is_creator(uuid, uuid)',
  'public.approve_is_signer(uuid, uuid)'
]) f;

-- 21. has_role now pins its search_path
select ok(
  (select proconfig from pg_proc
    where oid = 'public.has_role(uuid, text, text)'::regprocedure)
    @> array['search_path=""'],
  'has_role runs with an empty search_path'
);

-- 22. …and still answers correctly with it
insert into auth.users (id) values
  ('a1a1a1a1-0000-0000-0000-000000000001'), -- host
  ('a1a1a1a1-0000-0000-0000-000000000002'); -- someone else
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'grants-host@test.local', 'Host',
   false, '{"bento": ["admin"]}'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'grants-other@test.local', 'Other',
   false, '{}');

select ok(
  public.has_role('a1a1a1a1-0000-0000-0000-000000000001', 'bento', 'admin')
  and not public.has_role('a1a1a1a1-0000-0000-0000-000000000002', 'bento', 'admin'),
  'has_role still resolves roles with the pinned search_path'
);

-- 23. get_game_leaderboard still works for a signed-in member
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select * from public.get_game_leaderboard('snake'::public.game_type, null) $$,
  'a signed-in member can read the leaderboard'
);
reset role;

-- ═══ seed a quiz session owned by the host ═════════════════════════════════
insert into public.quiz_sets (id, title, created_by) values
  ('a1a1a1a1-0000-0000-0000-0000000000aa', 'Grants Quiz',
   'a1a1a1a1-0000-0000-0000-000000000001');
insert into public.quiz_questions
  (id, quiz_set_id, position, question_text, choices, correct_index, time_limit_seconds)
values
  ('a1a1a1a1-0000-0000-0000-0000000000bb', 'a1a1a1a1-0000-0000-0000-0000000000aa', 1,
   '1+1=?', array['1', '2', '3', '4'], 1, 20);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select public.create_quiz_session('a1a1a1a1-0000-0000-0000-0000000000aa');
reset role;

-- A superuser-owned lookup table, so the blocks below can name the session
-- without needing RLS read access to quiz_sessions.
create temp table grants_test_session as
select id as session_id from public.quiz_sessions
 where quiz_set_id = 'a1a1a1a1-0000-0000-0000-0000000000aa';
grant select on grants_test_session to authenticated;

-- ═══ 24-26. no signed-in user → 42501 'not authenticated' ══════════════════
-- Role authenticated with claims carrying no `sub`, i.e. no signed-in user.
-- The role still holds EXECUTE, so the error below comes from the function
-- body, not from the ACL.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  format('select public.advance_quiz_session(%L)',
         (select session_id from grants_test_session)),
  '42501', 'not authenticated',
  'advance_quiz_session rejects a request with no signed-in user'
);
select throws_ok(
  format('select public.reveal_quiz_answer(%L)',
         (select session_id from grants_test_session)),
  '42501', 'not authenticated',
  'reveal_quiz_answer rejects a request with no signed-in user'
);
select throws_ok(
  format('select * from public.get_current_question(%L)',
         (select session_id from grants_test_session)),
  '42501', 'not authenticated',
  'get_current_question rejects a request with no signed-in user'
);

-- ═══ 27-28. a signed-in member who is not the host → 42501 'forbidden' ═════
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  format('select public.advance_quiz_session(%L)',
         (select session_id from grants_test_session)),
  '42501', 'forbidden',
  'advance_quiz_session rejects a signed-in member who is not the host'
);
select throws_ok(
  format('select public.reveal_quiz_answer(%L)',
         (select session_id from grants_test_session)),
  '42501', 'forbidden',
  'reveal_quiz_answer rejects a signed-in member who is not the host'
);

-- ═══ 29-31. the real host still drives the session ═════════════════════════
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select status::text from public.advance_quiz_session(
     (select session_id from grants_test_session))),
  'question',
  'the host can advance the session to the first question'
);
select is(
  (select question_text from public.get_current_question(
     (select session_id from grants_test_session))),
  '1+1=?',
  'the host can read the live question'
);
select is(
  (select status::text from public.reveal_quiz_answer(
     (select session_id from grants_test_session))),
  'reveal',
  'the host can reveal the answer'
);
reset role;

select * from finish();
rollback;
