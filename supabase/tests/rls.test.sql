-- RLS / SECURITY DEFINER regression suite — runs via `supabase test db`.
-- Seeds two ordinary (non-admin) users, then asserts the security boundaries
-- that the strategy doc (#161) and the security advisors flagged. Impersonation
-- is done by switching to the `authenticated` role + setting the JWT claims that
-- auth.uid() reads (request.jwt.claims->>'sub').

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns must be callable after we drop to the authenticated role.
grant execute on all functions in schema public to authenticated;

select plan(8);

-- ── seed (as superuser — bypasses RLS) ──────────────────────────────────────
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, is_admin, roles) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', false, '{}'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', false, '{}');
insert into public.game_scores (user_id, game_type, score, finish_time_ms) values
  ('11111111-1111-1111-1111-111111111111', '2048', 1000, 5000);

-- ── impersonate user A (ordinary authenticated user) ────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- 1-2. prevent_role_escalation trigger blocks self-privilege changes
select throws_ok(
  $$ update public.user_profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111' $$,
  'Direct modification of is_admin is not allowed',
  'a non-admin cannot self-promote is_admin'
);
select throws_ok(
  $$ update public.user_profiles set roles = '{"bento":["admin"]}'::jsonb where id = '11111111-1111-1111-1111-111111111111' $$,
  'Direct modification of roles is not allowed',
  'a non-admin cannot self-grant app roles'
);

-- 3. but a non-privileged self-update of the same row is allowed (proves the
--    trigger gates only the privileged columns, not the whole row)
select lives_ok(
  $$ update public.user_profiles set name = 'Renamed' where id = '11111111-1111-1111-1111-111111111111' $$,
  'a user can still update non-privileged columns on their own profile'
);

-- 4. game_scores has no INSERT policy → direct writes are denied (must go
--    through the submit_game_score RPC gate)
select throws_ok(
  $$ insert into public.game_scores (user_id, game_type, score, finish_time_ms)
     values ('11111111-1111-1111-1111-111111111111', '2048', 999999, 1) $$,
  '42501',
  NULL,
  'direct INSERT into game_scores is denied by RLS (no insert policy)'
);

-- 5-6. game_scores is append-only: the deny-all UPDATE/DELETE policies make
--    those a silent no-op even for the row owner (RLS matches 0 rows).
update public.game_scores set score = 999999 where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select score from public.game_scores where user_id = '11111111-1111-1111-1111-111111111111'),
  1000,
  'game_scores UPDATE is a no-op for the owner (append-only)'
);
delete from public.game_scores where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.game_scores where user_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'game_scores DELETE is a no-op for the owner (append-only)'
);

-- 7. trip_admin_get_member_signatures only returns rows for trip admins; an
--    ordinary user gets zero rows regardless of the trip id (no signature leak).
select is(
  (select count(*) from public.trip_admin_get_member_signatures('33333333-3333-3333-3333-333333333333')),
  0::bigint,
  'a non-trip-admin batch-reads zero member signatures'
);

-- 8. another user (B) cannot read A's profile email via a privileged column?
--    profiles are intentionally world-readable for signing, so instead assert
--    B cannot mutate A's row (ownership check on the update policy).
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
update public.user_profiles set name = 'HijackedByB' where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is(
  (select name from public.user_profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Renamed',
  'user B cannot update user A''s profile (ownership-scoped update policy)'
);

select * from finish();
rollback;
