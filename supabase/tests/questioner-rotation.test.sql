-- meeting_question_pool / meeting_questioners rotation regression suite —
-- runs via `supabase test db`. Mirrors rls.test.sql's conventions: seed as
-- superuser (bypasses RLS), impersonate by switching to the `authenticated`
-- role + setting `request.jwt.claims` (what auth.uid() reads), assert with
-- pgTAP, `reset role` to go back to superuser for direct-table verification.
--
-- All pool `created_at` / meeting `scheduled_date` values are explicit
-- literals (never now()) so fairness ordering is fully deterministic. Each
-- scenario adds its own pool members and removes them again once done, so
-- later scenarios (in particular #7, "only 2 eligible members") aren't
-- polluted by earlier scenarios' pool rows — meeting_question_pool is a
-- single global table, unlike the per-scenario meetings it schedules.

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns must be callable after we drop to the authenticated role.
grant execute on all functions in schema public to authenticated;

select plan(43);

-- ── seed actors (as superuser — bypasses RLS) ───────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), -- admin
  ('00000000-0000-0000-0000-000000000002'), -- s1 presenter
  ('00000000-0000-0000-0000-000000000003'), -- s2 presenter
  ('00000000-0000-0000-0000-000000000004'), -- s5 presenter
  ('00000000-0000-0000-0000-000000000005'), -- s6 claimer
  ('00000000-0000-0000-0000-000000000006'), -- s6 other user
  ('00000000-0000-0000-0000-000000000007'), -- s7 presenter
  ('00000000-0000-0000-0000-000000000009'), -- ordinary non-admin (s5 + rls)
  ('00000000-0000-0000-0000-000000000011'), -- s1 pool
  ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000013'),
  ('00000000-0000-0000-0000-000000000014'),
  ('00000000-0000-0000-0000-000000000021'), -- s2 pool (021 = has prior history)
  ('00000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000023'),
  ('00000000-0000-0000-0000-000000000024'),
  ('00000000-0000-0000-0000-000000000031'), -- s4 presenter (also a stale questioner row)
  ('00000000-0000-0000-0000-000000000032'), -- s4 pre-existing valid questioner
  ('00000000-0000-0000-0000-000000000033'), -- s4 pool (backfill candidates)
  ('00000000-0000-0000-0000-000000000034'),
  ('00000000-0000-0000-0000-000000000041'), -- s5 pool
  ('00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000044'),
  ('00000000-0000-0000-0000-000000000051'), -- s6 pool
  ('00000000-0000-0000-0000-000000000052'),
  ('00000000-0000-0000-0000-000000000053'),
  ('00000000-0000-0000-0000-000000000054'),
  ('00000000-0000-0000-0000-000000000071'), -- s7 pool
  ('00000000-0000-0000-0000-000000000072'),
  ('00000000-0000-0000-0000-000000000091'), -- s9 pool (removal cleanup)
  ('00000000-0000-0000-0000-000000000092'),
  ('00000000-0000-0000-0000-000000000093'),
  ('00000000-0000-0000-0000-000000000094');

insert into public.user_profiles (id, email, name, roles) values
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 's1pres@test.local', 'S1 Presenter', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 's2pres@test.local', 'S2 Presenter', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 's5pres@test.local', 'S5 Presenter', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000005', 's6claimer@test.local', 'S6 Claimer', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000006', 's6other@test.local', 'S6 Other', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000007', 's7pres@test.local', 'S7 Presenter', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000009', 'nonadmin@test.local', 'Ordinary User', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000011', 's1u1@test.local', 'S1 Pool 1', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000012', 's1u2@test.local', 'S1 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000013', 's1u3@test.local', 'S1 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000014', 's1u4@test.local', 'S1 Pool 4', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000021', 's2hist@test.local', 'S2 History Member', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000022', 's2u2@test.local', 'S2 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000023', 's2u3@test.local', 'S2 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000024', 's2u4@test.local', 'S2 Pool 4', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000031', 's4pres@test.local', 'S4 Presenter', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000032', 's4u2@test.local', 'S4 Existing Questioner', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000033', 's4u3@test.local', 'S4 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000034', 's4u4@test.local', 'S4 Pool 4', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000041', 's5u1@test.local', 'S5 Pool 1', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000042', 's5u2@test.local', 'S5 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000043', 's5u3@test.local', 'S5 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000044', 's5u4@test.local', 'S5 Pool 4', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000051', 's6u1@test.local', 'S6 Pool 1', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000052', 's6u2@test.local', 'S6 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000053', 's6u3@test.local', 'S6 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000054', 's6u4@test.local', 'S6 Pool 4', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000071', 's7u1@test.local', 'S7 Pool 1', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000072', 's7u2@test.local', 'S7 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000091', 's9a@test.local', 'S9 Pool A', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000092', 's9b@test.local', 'S9 Pool B', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000093', 's9c@test.local', 'S9 Pool C', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000094', 's9d@test.local', 'S9 Pool D', '{}'::jsonb);

-- meetings for each scenario, distinct scheduled_date values throughout.
insert into public.meetings (id, year, scheduled_date, is_holiday, presenter_user_id) values
  ('10000000-0000-0000-0000-000000000003', 2026, '2026-01-06', false, null),                                       -- m2_hist (past)
  ('10000000-0000-0000-0000-000000000001', 2026, '2026-02-03', false, '00000000-0000-0000-0000-000000000002'),     -- m1
  ('10000000-0000-0000-0000-000000000002', 2026, '2026-02-10', false, '00000000-0000-0000-0000-000000000003'),     -- m2
  ('10000000-0000-0000-0000-000000000004', 2026, '2026-02-17', false, '00000000-0000-0000-0000-000000000031'),     -- m4
  ('10000000-0000-0000-0000-000000000005', 2026, '2026-02-24', false, '00000000-0000-0000-0000-000000000004'),     -- m5
  ('10000000-0000-0000-0000-000000000006', 2026, '2026-03-03', false, null),                                       -- m6 (unclaimed)
  ('10000000-0000-0000-0000-000000000007', 2026, '2026-03-10', false, '00000000-0000-0000-0000-000000000007');     -- m7

-- pre-existing meeting_questioners rows that scenarios 2 and 4 depend on.
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000021', 'auto'), -- s2_hist's prior "ask"
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000031', 'auto'), -- s4: about to become presenter (to be evicted)
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000032', 'auto'); -- s4: valid, must survive untouched

-- ═══ Scenario 1: sync picks exactly 3 from >=4 eligible pool members ═══════
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000011', '2020-01-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000012', '2020-01-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000013', '2020-01-01 00:00:03+00'),
  ('00000000-0000-0000-0000-000000000014', '2020-01-01 00:00:04+00');

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000001'),
  3,
  'sync assigns exactly 3 questioners when at least 4 eligible pool members exist'
);
select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000002'
  ),
  'the presenter is never among the assigned questioners'
);
select is(
  (select count(*)::int from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000001' and source = 'auto'),
  3,
  'all system-assigned rows are marked source = auto'
);

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014'
);

-- ═══ Scenario 2: never-asked members outrank a member with prior history ═══
-- s2_hist joined the pool FIRST (earliest pool_added_at) but was already
-- asked once (m2_hist), so it must rank LAST behind the 3 never-asked
-- members — proving last_asked_date dominates pool_added_at in the sort.
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000021', '2020-02-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000022', '2020-02-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000023', '2020-02-01 00:00:03+00'),
  ('00000000-0000-0000-0000-000000000024', '2020-02-01 00:00:04+00');

select is(
  (select array_agg(user_id order by last_asked_date asc nulls first, pool_added_at asc, user_id asc)
   from public.meeting_question_rotation
   where user_id in (
     '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022',
     '00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000024'
   )),
  array[
    '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000021'
  ]::uuid[],
  'never-asked members rank ahead of a member with prior history, even though that member joined the pool first'
);

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000002');

select is(
  (select array_agg(user_id order by user_id) from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000002'),
  array[
    '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000024'
  ]::uuid[],
  'sync picks the 3 never-asked members over the one with prior history'
);

-- ═══ Scenario 3: sync is idempotent ═════════════════════════════════════
create temp table s3_snapshot as
  select meeting_id, user_id, source from public.meeting_questioners
  where meeting_id = '10000000-0000-0000-0000-000000000002';

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000002');

select results_eq(
  $$ select meeting_id, user_id, source from public.meeting_questioners
     where meeting_id = '10000000-0000-0000-0000-000000000002' order by user_id $$,
  $$ select meeting_id, user_id, source from s3_snapshot order by user_id $$,
  'calling sync twice in a row produces an identical questioner set (idempotent)'
);

drop table s3_snapshot;
delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000024'
);

-- ═══ Scenario 4: presenter-conflict eviction, no reshuffling ═══════════════
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000033', '2020-04-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000034', '2020-04-01 00:00:02+00');

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000004');

select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000004'
      and user_id = '00000000-0000-0000-0000-000000000031'
  ),
  'the presenter is evicted from the questioner list after becoming presenter'
);
select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000004'),
  3,
  'eviction is backfilled back up to 3 questioners'
);
select ok(
  exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000004'
      and user_id = '00000000-0000-0000-0000-000000000032'
      and source = 'auto'
  ),
  'the pre-existing valid questioner is left untouched, not reshuffled'
);

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000034'
);

-- ═══ Scenario 5: meetings_replace_questioner ════════════════════════════
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000041', '2020-05-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000042', '2020-05-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000043', '2020-05-01 00:00:03+00'),
  ('00000000-0000-0000-0000-000000000044', '2020-05-01 00:00:04+00');

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000005');
-- picks s5_u1, s5_u2, s5_u3 (earliest pool_added_at); s5_u4 is the spare.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000005',
       '00000000-0000-0000-0000-000000000041',
       null
     ) $$,
  '42501',
  NULL,
  'a non-admin cannot call meetings_replace_questioner'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000005',
       '00000000-0000-0000-0000-000000000041',
       null
     ) $$,
  'an admin can replace a questioner, auto-picking the next-in-rotation candidate'
);
select is(
  (select array_agg(user_id order by user_id) from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000005'),
  array[
    '00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000043',
    '00000000-0000-0000-0000-000000000044'
  ]::uuid[],
  'the removed member is replaced by the deterministic next-in-rotation candidate'
);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000005',
       '00000000-0000-0000-0000-000000000042',
       '00000000-0000-0000-0000-000000000042'
     ) $$,
  'P0001',
  '替補人選不可與被移除者相同',
  'replacement cannot equal the member being removed'
);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000005',
       '00000000-0000-0000-0000-000000000042',
       '00000000-0000-0000-0000-000000000004'
     ) $$,
  'P0001',
  '替補人選不可為本週報告人',
  'replacement cannot be the meeting presenter'
);
reset role;

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000044'
);

-- ═══ Scenario 6: meetings_claim ═════════════════════════════════════════
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000051', '2020-06-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000052', '2020-06-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000053', '2020-06-01 00:00:03+00'),
  ('00000000-0000-0000-0000-000000000054', '2020-06-01 00:00:04+00');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select public.meetings_claim('10000000-0000-0000-0000-000000000006') $$,
  'an ordinary authenticated user can claim an unclaimed, non-holiday meeting'
);
reset role;

select is(
  (select presenter_user_id from public.meetings where id = '10000000-0000-0000-0000-000000000006'),
  '00000000-0000-0000-0000-000000000005'::uuid,
  'claiming sets presenter_user_id to the claiming user'
);
select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000006'),
  3,
  'claiming a meeting triggers automatic assignment of 3 questioners'
);
select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000006'
      and user_id = '00000000-0000-0000-0000-000000000005'
  ),
  'the claimer (now presenter) is excluded from their own questioner list'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.meetings_claim('10000000-0000-0000-0000-000000000006') $$,
  'P0001',
  '此週已被其他人認領，請重新整理頁面',
  'a second user cannot claim an already-claimed meeting'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select public.meetings_claim('10000000-0000-0000-0000-000000000006') $$,
  'the original claimer can call claim again idempotently'
);
reset role;

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000052',
  '00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000054'
);

-- ═══ Scenario 7: only 2 eligible members — no error, assigns both ══════════
-- Global pool is empty at this point (every prior scenario cleaned up after
-- itself), so these 2 rows are the only candidates meetings_sync_questioners
-- can see.
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000071', '2020-07-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000072', '2020-07-01 00:00:02+00');

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000007');

select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000007'),
  2,
  'sync assigns exactly the 2 available eligible members without erroring'
);
select is(
  (select array_agg(user_id order by user_id) from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000007'),
  array['00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000072']::uuid[],
  'both eligible pool members are assigned when only 2 exist'
);

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000072'
);

-- ═══ Scenario 8: RLS — read open to authenticated, direct write denied ═════
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select count(*) from public.meeting_question_pool $$,
  'authenticated non-admin can select meeting_question_pool'
);
select lives_ok(
  $$ select count(*) from public.meeting_questioners $$,
  'authenticated non-admin can select meeting_questioners'
);
select lives_ok(
  $$ select count(*) from public.meeting_question_rotation $$,
  'authenticated non-admin can select the meeting_question_rotation view'
);
select throws_ok(
  $$ insert into public.meeting_questioners (meeting_id, user_id, source)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000009', 'manual') $$,
  '42501',
  NULL,
  'a non-admin cannot directly INSERT into meeting_questioners (must go through the RPCs)'
);
reset role;

-- ═══ Scenario 9: removing a pool member cleans FUTURE rosters, keeps PAST ═══
-- The only scenario that depends on future-vs-past, so meeting dates are
-- relative to current_date (not fixed literals like the others).
insert into public.meetings (id, year, scheduled_date, is_holiday, presenter_user_id) values
  ('10000000-0000-0000-0000-000000000009', 2026, current_date + 30, false, '00000000-0000-0000-0000-000000000002'), -- mFuture
  ('10000000-0000-0000-0000-00000000000a', 2026, current_date - 30, false, '00000000-0000-0000-0000-000000000003'); -- mPast

insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000091', '2020-09-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000092', '2020-09-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000093', '2020-09-01 00:00:03+00'),
  ('00000000-0000-0000-0000-000000000094', '2020-09-01 00:00:04+00');

-- Assign the future meeting first (A, B, C picked; D spare), while A has no
-- history so it still qualifies.
select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000009');

-- A also carries a PAST questioner row — history that must survive removal.
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000091', 'auto');

-- A non-admin cannot remove from the pool.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.meetings_remove_from_pool('00000000-0000-0000-0000-000000000091') $$,
  '42501',
  NULL,
  'a non-admin cannot remove a member from the question pool'
);
reset role;

-- An admin removes A.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select public.meetings_remove_from_pool('00000000-0000-0000-0000-000000000091') $$,
  'an admin can remove a member from the question pool'
);
reset role;

select ok(
  not exists (
    select 1 from public.meeting_question_pool
    where user_id = '00000000-0000-0000-0000-000000000091'
  ),
  'the removed member is gone from the pool'
);
select is(
  (select array_agg(user_id order by user_id) from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000009'),
  array[
    '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000093',
    '00000000-0000-0000-0000-000000000094'
  ]::uuid[],
  'future meeting: the removed member is evicted and the slot is backfilled from the pool'
);
select ok(
  exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-00000000000a'
      and user_id = '00000000-0000-0000-0000-000000000091'
  ),
  'past meeting: the removed member''s historical questioner row is preserved'
);

delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000093',
  '00000000-0000-0000-0000-000000000094'
);

-- ═══ Scenario 10: presenter-pool members are auto-eligible questioners ══════
-- The question pool is empty here (every prior scenario cleaned up). Members
-- exist ONLY in the presenter pool, yet must be pickable as questioners, and a
-- member in BOTH pools must appear once. The current-week presenter, though in
-- the presenter pool, is still excluded from their own week.
-- Reuses user_profiles rows 011/012/013 (freed by Scenario 1's cleanup) and
-- presenter 002; meeting m10 on a distinct date.
insert into public.meetings (id, year, scheduled_date, is_holiday, presenter_user_id) values
  ('10000000-0000-0000-0000-000000000010', 2026, '2026-05-05', false, '00000000-0000-0000-0000-000000000002'); -- m10, presenter = S1 Presenter

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order, created_at) values
  ('00000000-0000-0000-0000-000000000002', 113, 1, '2020-10-01 00:00:00+00'), -- the presenter, also in the roster
  ('00000000-0000-0000-0000-000000000011', 113, 2, '2020-10-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000012', 113, 3, '2020-10-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000013', 113, 4, '2020-10-01 00:00:03+00');

-- 013 is ALSO an "extra" in the question pool — must not double-count.
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000013', '2020-10-02 00:00:00+00');

select ok(
  exists (
    select 1 from public.meeting_question_rotation
    where user_id = '00000000-0000-0000-0000-000000000011'
  ),
  'a presenter-pool-only member appears in the questioner rotation'
);
select is(
  (select count(*)::int from public.meeting_question_rotation
   where user_id = '00000000-0000-0000-0000-000000000013'),
  1,
  'a member in BOTH pools appears exactly once in the rotation (union dedup)'
);

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000010');

select is(
  (select array_agg(user_id order by user_id) from public.meeting_questioners
   where meeting_id = '10000000-0000-0000-0000-000000000010'),
  array[
    '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000013'
  ]::uuid[],
  'sync fills questioners from the presenter pool when the question pool has no others'
);
select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000010'
      and user_id = '00000000-0000-0000-0000-000000000002'
  ),
  'the current-week presenter is excluded from their own week even though they are in the presenter pool'
);

delete from public.meeting_question_pool where user_id = '00000000-0000-0000-0000-000000000013';
delete from public.meeting_presenter_pool where user_id in (
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013'
);

-- ═══ Scenario 11: manual replacement accepts presenter-pool members too ════
-- Union consistency: meetings_replace_questioner has its own base-table
-- eligibility check on the manual-replacement path, separate from the view
-- the auto-pick branch reads. It must accept the same union the rotation
-- view now draws from — a presenter-pool-only member is a valid manual
-- replacement, and a member in NEITHER pool is still rejected.
-- Reuses freed user_profiles rows 021/022/023 (freed by Scenario 2's
-- cleanup) — none are in any pool when this scenario starts. Meeting m11 on
-- a distinct date; presenter reuses S2 Presenter (003, not in any pool now).
insert into public.meetings (id, year, scheduled_date, is_holiday, presenter_user_id) values
  ('10000000-0000-0000-0000-000000000011', 2026, '2026-06-02', false, '00000000-0000-0000-0000-000000000003'); -- m11

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order, created_at) values
  ('00000000-0000-0000-0000-000000000021', 113, 1, '2020-11-01 00:00:00+00'); -- presenter-pool-ONLY member (021 is NOT in meeting_question_pool)

insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', 'auto'); -- pre-assigned, about to be manually removed

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000011',
       '00000000-0000-0000-0000-000000000022',
       '00000000-0000-0000-0000-000000000021'
     ) $$,
  'an admin can manually replace a questioner with a presenter-pool-only member'
);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       '10000000-0000-0000-0000-000000000011',
       '00000000-0000-0000-0000-000000000021',
       '00000000-0000-0000-0000-000000000023'
     ) $$,
  'P0001',
  '替補人選不在提問成員池中',
  'a replacement in neither pool is still rejected'
);
reset role;

delete from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000011';
delete from public.meeting_presenter_pool where user_id = '00000000-0000-0000-0000-000000000021';

-- ═══ Scenario 12: future-eviction must use the UNION, not the narrow pool ══
-- Fresh actors (101-105): every previously-freed id from Scenarios 1-11 has
-- since picked up real questioner history (a non-null last_asked_date),
-- which would win the "nulls first" ranking tie-break and make the auto-pick
-- order depend on which meetings ran first instead of on this scenario's own
-- setup. Fresh, never-asked actors keep the ranking fully deterministic.
-- Meeting m12 is future-dated (like Scenario 9) since the eviction branch
-- only runs for future meetings.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000105');

insert into public.user_profiles (id, email, name, roles) values
  ('00000000-0000-0000-0000-000000000101', 's12p1@test.local', 'S12 Pool 1', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 's12p2@test.local', 'S12 Pool 2', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 's12p3@test.local', 'S12 Pool 3', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', 's12x@test.local', 'S12 Presenter-Pool-Only', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000105', 's12y@test.local', 'S12 Stray', '{}'::jsonb);
--
-- The question pool has exactly 3 members, so the first sync fills all 3
-- slots from it (v_missing drops to 0 afterwards). X is then added as a
-- MANUAL 4th assignment — a manual override the way an admin would create
-- one. Because the slots are already full, a SECOND sync's eviction is the
-- only thing that can remove X: if it evicts him (the pre-union bug), there
-- is no missing slot left to trigger a backfill that would silently restore
-- him, so the loss is real and observable — not masked by the same-call
-- backfill the way a naive test would be.
insert into public.meetings (id, year, scheduled_date, is_holiday, presenter_user_id) values
  ('10000000-0000-0000-0000-000000000012', 2026, current_date + 31, false, '00000000-0000-0000-0000-000000000004'); -- m12, presenter reuses S5 Presenter (current_date + 30 is scenario 9's mFuture, above)

insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000101', '2020-12-01 00:00:01+00'),
  ('00000000-0000-0000-0000-000000000102', '2020-12-01 00:00:02+00'),
  ('00000000-0000-0000-0000-000000000103', '2020-12-01 00:00:03+00');

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order, created_at) values
  ('00000000-0000-0000-0000-000000000104', 113, 1, '2020-12-01 00:00:04+00'); -- X: presenter-pool-ONLY, not in meeting_question_pool, ranks last so the first sync doesn't auto-pick him

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000012');

select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000012'),
  3,
  'the first sync fills all 3 slots from the question pool alone, leaving no missing slot'
);

-- Manually assign X as a 4th questioner — a manual override.
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000104', 'manual');

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000012');

select ok(
  exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000012'
      and user_id = '00000000-0000-0000-0000-000000000104'
  ),
  'a manually-assigned presenter-pool-only questioner survives a resync of a FULL future meeting (must use the union, not the narrow pool — with no missing slot to mask the loss via backfill)'
);

-- A stray questioner in NEITHER pool must still be evicted.
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000105', 'manual'); -- Y: in neither pool

select public.meetings_sync_questioners('10000000-0000-0000-0000-000000000012');

select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = '10000000-0000-0000-0000-000000000012'
      and user_id = '00000000-0000-0000-0000-000000000105'
  ),
  'a questioner who has left BOTH pools is still evicted by the future-meeting eviction'
);

delete from public.meeting_questioners where meeting_id = '10000000-0000-0000-0000-000000000012';
delete from public.meeting_question_pool where user_id in (
  '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103'
);
delete from public.meeting_presenter_pool where user_id = '00000000-0000-0000-0000-000000000104';

-- ═══ Scenario 13: narrow "extras" panel view excludes presenter-pool-only ═══
-- Reuses freed user_profiles rows 022 (question pool, A) and 012
-- (presenter-pool-only, B; freed by Scenario 10's cleanup). No meeting
-- needed — this scenario only checks view membership.
insert into public.meeting_question_pool (user_id, created_at) values
  ('00000000-0000-0000-0000-000000000022', '2020-12-02 00:00:01+00'); -- A

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order, created_at) values
  ('00000000-0000-0000-0000-000000000012', 113, 1, '2020-12-02 00:00:02+00'); -- B, presenter-pool-ONLY

select ok(
  exists (
    select 1 from public.meeting_question_pool_members
    where user_id = '00000000-0000-0000-0000-000000000022'
  ),
  'the narrow panel view includes a meeting_question_pool member'
);
select ok(
  not exists (
    select 1 from public.meeting_question_pool_members
    where user_id = '00000000-0000-0000-0000-000000000012'
  ),
  'the narrow panel view excludes a presenter-pool-only member'
);
select ok(
  exists (
    select 1 from public.meeting_question_rotation
    where user_id = '00000000-0000-0000-0000-000000000012'
  ),
  'the widened rotation view DOES include the presenter-pool-only member, proving the two views differ as intended'
);

delete from public.meeting_question_pool where user_id = '00000000-0000-0000-0000-000000000022';
delete from public.meeting_presenter_pool where user_id = '00000000-0000-0000-0000-000000000012';

select * from finish();
rollback;
