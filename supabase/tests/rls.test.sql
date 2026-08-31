-- RLS / SECURITY DEFINER regression suite — runs via `supabase test db`.
-- Seeds two ordinary (non-admin) users, then asserts the security boundaries
-- that the strategy doc (#161) and the security advisors flagged. Impersonation
-- is done by switching to the `authenticated` role + setting the JWT claims that
-- auth.uid() reads (request.jwt.claims->>'sub').

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns must be callable after we drop to the authenticated role.
grant execute on all functions in schema public to authenticated;

select plan(26);

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

-- 4-5. lab_status write guard (20260830100500): it's the first ordering key
--    of the presenter roster, so a member forging their own lab_status could
--    jump the queue for meetings_fill_presenters. prevent_role_escalation
--    must pin it the same way it already pins roles/is_admin — but the write
--    itself must not error (it's a legitimate column on an otherwise-normal
--    profile save), so the assertion is on the STORED value, not on throws_ok.
update public.user_profiles set lab_status = 'doctoral'
  where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select lab_status from public.user_profiles where id = '11111111-1111-1111-1111-111111111111'),
  NULL,
  'a member cannot self-promote lab_status — the write "succeeds" but the stored value is unchanged'
);

-- service_role is the deliberate carve-out: the nightly Keycloak sync
-- (api/cron/kc-lab-status) authenticates as service_role and must still be
-- able to write this column.
reset role;
set local role service_role;
update public.user_profiles set lab_status = 'doctoral'
  where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is(
  (select lab_status from public.user_profiles where id = '11111111-1111-1111-1111-111111111111'),
  'doctoral',
  'service_role (the nightly Keycloak sync) can still write lab_status'
);

-- back to impersonating user A for the rest of the ordinary-user assertions.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- 6. game_scores has no INSERT policy → direct writes are denied (must go
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

-- ── rooms_bookings: Portal's own booking-automation audit trail ────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- 9. a user can insert a rooms_bookings row for themselves
select lives_ok(
  $$ insert into public.rooms_bookings (external_reservation_id, room, date, start_time, end_time, requested_by)
     values ('test-ext-1', '600A', '2026-08-01', '10:00', '10:30', '11111111-1111-1111-1111-111111111111') $$,
  'a user can insert a rooms_bookings row for themselves'
);

-- 10. a user cannot insert a rooms_bookings row claiming to be someone else
select throws_ok(
  $$ insert into public.rooms_bookings (external_reservation_id, room, date, start_time, end_time, requested_by)
     values ('test-ext-2', '600A', '2026-08-01', '11:00', '11:30', '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  NULL,
  'a user cannot insert a rooms_bookings row on someone else''s behalf'
);

-- 11. user B cannot cancel (update) a booking made by user A
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
update public.rooms_bookings set status = 'cancelled' where external_reservation_id = 'test-ext-1';
reset role;
select is(
  (select status from public.rooms_bookings where external_reservation_id = 'test-ext-1'),
  'booked',
  'user B cannot cancel user A''s rooms_bookings row'
);

-- ── rooms_meeting_requests: the pipeline's callback credential ─────────────
-- These four pin the grant, not the policy. The first cut of this table had
-- RLS with a read-only policy but inherited Supabase's default table grants,
-- which handed `authenticated` full write and exposed callback_token_hash —
-- the same shape as #343/#346. A policy test alone would have passed.
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.rooms_meeting_requests', 'INSERT'),
  'authenticated has no INSERT grant on rooms_meeting_requests'
);
select ok(
  not has_table_privilege('authenticated', 'public.rooms_meeting_requests', 'UPDATE'),
  'authenticated has no UPDATE grant on rooms_meeting_requests'
);
select ok(
  not has_table_privilege('anon', 'public.rooms_meeting_requests', 'SELECT'),
  'anon cannot read rooms_meeting_requests at all'
);
-- The token hash is the one column no browser has any use for.
select ok(
  not has_column_privilege(
    'authenticated', 'public.rooms_meeting_requests', 'callback_token_hash', 'SELECT'
  ),
  'authenticated cannot read rooms_meeting_requests.callback_token_hash'
);

-- ── rooms_bookings: cancellation is the only update a person may make ─────
-- The RLS policy restricts updates to the owner's own rows; these pin which
-- COLUMNS that update may touch. Without the column grant, a booking's owner
-- could rewrite meeting_prefix over the REST API and file another group's
-- Teams recording under their own name — the policy alone allows it.
select ok(
  has_column_privilege('authenticated', 'public.rooms_bookings', 'status', 'UPDATE'),
  'a booking owner can flip status (cancellation)'
);
select ok(
  not has_column_privilege('authenticated', 'public.rooms_bookings', 'meeting_prefix', 'UPDATE'),
  'a booking owner cannot rewrite meeting_prefix'
);
select ok(
  not has_column_privilege('authenticated', 'public.rooms_bookings', 'invite_sequence', 'UPDATE'),
  'a booking owner cannot rewrite invite_sequence'
);

-- An online-only booking has no room and no external reservation; a booking
-- with one but not the other would be a reservation nobody can cancel.
select throws_ok(
  $$ insert into public.rooms_bookings (room, external_reservation_id, date, start_time, end_time, requested_by)
     values ('600A', null, '2026-08-01', '14:00', '15:00', '11111111-1111-1111-1111-111111111111') $$,
  '23514',
  NULL,
  'a booking cannot have a room without an external reservation id'
);

-- ── lab_status_synced_at + lab_status_sync_runs (20260831140300) ────────────
-- The timestamp feeds the panel's "上次同步:N 天前" warning, so a member who
-- could write it could silence the alarm rather than trip it — pinned exactly
-- like lab_status, and for a sharper reason.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

update public.user_profiles set lab_status_synced_at = now()
  where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select lab_status_synced_at from public.user_profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  NULL,
  'a member cannot backdate their own lab_status_synced_at to make a dead sync look healthy'
);

reset role;
set local role service_role;
update public.user_profiles set lab_status_synced_at = '2026-08-31 00:00:00+00'
  where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is(
  (select lab_status_synced_at from public.user_profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  '2026-08-31 00:00:00+00'::timestamptz,
  'the nightly sync (service_role) can still stamp lab_status_synced_at'
);

insert into public.lab_status_sync_runs (status, scanned, changed) values ('ok', 44, 2);

-- The run log is readable by any signed-in member (the panel shows it) but
-- writable by nobody except service_role: there is no insert policy at all.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select count(*)::int from public.lab_status_sync_runs),
  1,
  'a signed-in member can read the sync run log'
);
select throws_ok(
  $$ insert into public.lab_status_sync_runs (status) values ('ok') $$,
  '42501',
  NULL,
  'a signed-in member cannot forge a sync run — there is no insert policy'
);

-- Supabase's default privileges grant anon directly, so enabling RLS is not by
-- itself enough to keep a table off the public API — the grant has to be
-- revoked as well. This repo has been caught by that before (see
-- 20260828140000_quiz-players-revoke-direct-writes).
reset role;
set local role anon;
select throws_ok(
  $$ select 1 from public.lab_status_sync_runs $$,
  '42501',
  NULL,
  'anon cannot read the sync run log at all — the grant is revoked, not merely policy-gated'
);

reset role;

select * from finish();
rollback;
