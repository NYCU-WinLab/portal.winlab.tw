-- meetings_swap / meetings_insert_week / meetings_remove_week regression suite —
-- runs via `supabase test db`. Mirrors questioner-rotation.test.sql conventions:
-- seed as superuser (bypasses RLS), impersonate by switching to the
-- `authenticated` role + setting request.jwt.claims (what auth.uid()/is_meetings_admin
-- read), assert with pgTAP as superuser (reset role) for direct-table verification.
-- All dates are explicit literals; the insert scenario uses a THURSDAY cadence
-- (2031-03-05 …) on purpose, to prove the trailing-slot mint preserves the
-- schedule's own weekday rather than hard-coding Monday.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(45);

-- ── actors ──────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'), -- admin (meetings admin)
  ('aaaaaaaa-0000-0000-0000-000000000009'), -- ordinary non-admin
  ('aaaaaaaa-0000-0000-0000-000000000002'), -- P1
  ('aaaaaaaa-0000-0000-0000-000000000003'), -- P2
  ('aaaaaaaa-0000-0000-0000-000000000004'), -- P3
  ('aaaaaaaa-0000-0000-0000-000000000005'), -- P4
  ('aaaaaaaa-0000-0000-0000-000000000021'), -- PA
  ('aaaaaaaa-0000-0000-0000-000000000022'), -- PB
  ('aaaaaaaa-0000-0000-0000-000000000023'), -- PC
  ('aaaaaaaa-0000-0000-0000-000000000031'), -- QX (distinctive questioner)
  ('aaaaaaaa-0000-0000-0000-000000000011'), -- Q1 pool
  ('aaaaaaaa-0000-0000-0000-000000000012'), -- Q2 pool
  ('aaaaaaaa-0000-0000-0000-000000000013'), -- Q3 pool
  ('aaaaaaaa-0000-0000-0000-000000000014'); -- Q4 pool

insert into public.user_profiles (id, email, name, roles) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@test.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'non@test.local', 'Non Admin', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'p1@test.local', 'P1', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'p2@test.local', 'P2', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'p3@test.local', 'P3', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'p4@test.local', 'P4', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000021', 'pa@test.local', 'PA', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000022', 'pb@test.local', 'PB', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000023', 'pc@test.local', 'PC', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000031', 'qx@test.local', 'QX', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'q1@test.local', 'Q1', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'q2@test.local', 'Q2', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'q3@test.local', 'Q3', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'q4@test.local', 'Q4', '{}'::jsonb);

-- ── meetings ─────────────────────────────────────────────────────────────────
-- Swap year 2030
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('cccccccc-0000-0000-0000-000000000001', 2030, '第1週', '2030-03-04', false, 'P1', 'aaaaaaaa-0000-0000-0000-000000000002'), -- MA
  ('cccccccc-0000-0000-0000-000000000002', 2030, '第2週', '2030-03-11', false, 'P2', 'aaaaaaaa-0000-0000-0000-000000000003'), -- MB
  ('cccccccc-0000-0000-0000-000000000003', 2030, '春假', '2030-03-18', true,  null, null),                                     -- MH (holiday)
  ('cccccccc-0000-0000-0000-000000000005', 2030, '第5週', '2030-05-06', false, 'P3', 'aaaaaaaa-0000-0000-0000-000000000004'), -- MX (eviction)
  ('cccccccc-0000-0000-0000-000000000006', 2030, '第6週', '2030-05-13', false, 'P4', 'aaaaaaaa-0000-0000-0000-000000000005'), -- MY (eviction)
  ('cccccccc-0000-0000-0000-000000000004', 2033, '第1週', '2033-05-01', false, null, null);                                    -- MC (other year)

-- Insert/remove year 2031 (Thursday cadence)
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('dddddddd-0000-0000-0000-000000000001', 2031, '第1週', '2031-03-05', false, 'PA', 'aaaaaaaa-0000-0000-0000-000000000021'), -- I1
  ('dddddddd-0000-0000-0000-000000000002', 2031, '第2週', '2031-03-12', false, 'PB', 'aaaaaaaa-0000-0000-0000-000000000022'), -- I2
  ('dddddddd-0000-0000-0000-000000000003', 2031, '春假', '2031-03-19', true,  null, null),                                     -- IH (holiday)
  ('dddddddd-0000-0000-0000-000000000004', 2031, '第3週', '2031-03-26', false, 'PC', 'aaaaaaaa-0000-0000-0000-000000000023'); -- I3

-- pool for swap questioner checks
insert into public.meeting_question_pool (user_id, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000011', '2020-01-01 00:00:01+00'),
  ('aaaaaaaa-0000-0000-0000-000000000012', '2020-01-01 00:00:02+00'),
  ('aaaaaaaa-0000-0000-0000-000000000013', '2020-01-01 00:00:03+00'),
  ('aaaaaaaa-0000-0000-0000-000000000014', '2020-01-01 00:00:04+00');

-- MA/MB questioners via the real rotation (MA -> Q1,Q2,Q3)
select public.meetings_sync_questioners('cccccccc-0000-0000-0000-000000000001');
select public.meetings_sync_questioners('cccccccc-0000-0000-0000-000000000002');

-- MX questioners incl. P4 (manual) so the swap-in presenter collides -> eviction
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005', 'manual'), -- P4 (will become presenter after swap)
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000011', 'auto'),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000012', 'auto');

-- I3 has a distinctive manual questioner QX to prove it rides with the presenter
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000031', 'manual');

-- ═══ meetings_swap ══════════════════════════════════════════════════════════
-- non-admin cannot swap
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'a non-admin cannot call meetings_swap');
reset role;

-- admin-gated validation errors (reached only after the admin check passes)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001') $$,
  'P0001', '不能與自己互換', 'cannot swap a meeting with itself');
select throws_ok(
  $$ select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000004') $$,
  'P0001', '只能在同一年度內互換', 'cannot swap across years');
select throws_ok(
  $$ select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003') $$,
  'P0001', '假期週不可互換', 'cannot swap a holiday week');
reset role;

-- snapshot MA's questioners right before the successful swap
create temp table ma_q_before as
  select user_id, source from public.meeting_questioners
  where meeting_id = 'cccccccc-0000-0000-0000-000000000001';

-- admin performs the swap MA <-> MB
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002');
reset role;

select is(
  (select presenter_user_id from public.meetings where id = 'cccccccc-0000-0000-0000-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  'swap moves MB''s presenter (P2) onto MA');
select is(
  (select presenter_user_id from public.meetings where id = 'cccccccc-0000-0000-0000-000000000002'),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'swap moves MA''s presenter (P1) onto MB');
select is(
  (select scheduled_date from public.meetings where id = 'cccccccc-0000-0000-0000-000000000001'),
  '2030-03-04'::date,
  'MA keeps its original date after swap (dates never move on a swap)');
select is(
  (select scheduled_date from public.meetings where id = 'cccccccc-0000-0000-0000-000000000002'),
  '2030-03-11'::date,
  'MB keeps its original date after swap');
select results_eq(
  $$ select user_id, source from public.meeting_questioners
     where meeting_id = 'cccccccc-0000-0000-0000-000000000001' order by user_id $$,
  $$ select user_id, source from ma_q_before order by user_id $$,
  'swap leaves the questioner list on the date unchanged (questioners stay on the date)');

-- self-inverse: swapping again restores the original presenters
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_swap('cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002');
reset role;
select is(
  (select presenter_user_id from public.meetings where id = 'cccccccc-0000-0000-0000-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'swapping the same pair again restores the original presenter (swap is its own inverse)');

-- eviction self-heal: MX <-> MY makes P4 (a questioner on MX) the MX presenter
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_swap('cccccccc-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000006');
reset role;
select ok(
  not exists (
    select 1 from public.meeting_questioners
    where meeting_id = 'cccccccc-0000-0000-0000-000000000005'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'a questioner who becomes the presenter via swap is evicted from that date''s list');
select is(
  (select count(*)::int from public.meeting_questioners where meeting_id = 'cccccccc-0000-0000-0000-000000000005'),
  3,
  'eviction is backfilled so the date still has 3 questioners');

-- ═══ meetings_insert_week ═══════════════════════════════════════════════════
-- non-admin cannot insert
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_insert_week('dddddddd-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'a non-admin cannot call meetings_insert_week');
reset role;

-- cannot insert at a holiday week; then insert at I1 (postpone from 第1週)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_insert_week('dddddddd-0000-0000-0000-000000000003') $$,
  'P0001', '不能在假期週插入', 'cannot insert at a holiday week');
select public.meetings_insert_week('dddddddd-0000-0000-0000-000000000001');
reset role;

select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000001'),
  '2031-03-12'::date,
  'insert postpones I1 (第1週) one meeting later');
select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000002'),
  '2031-03-26'::date,
  'insert postpones I2 past the anchored holiday (3/19 skipped)');
select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000004'),
  '2031-04-02'::date,
  'the last presenter lands on a freshly minted trailing week, weekday preserved (+7, Thursday)');
select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000003'),
  '2031-03-19'::date,
  'the holiday week stays anchored to its real date');
select is(
  (select count(*)::int from public.meetings
   where year = 2031 and scheduled_date = '2031-03-05' and presenter_user_id is null and not is_holiday),
  1,
  'a blank week is inserted at the freed earliest slot');
select ok(
  exists (
    select 1 from public.meeting_questioners
    where meeting_id = 'dddddddd-0000-0000-0000-000000000004'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000031'),
  'the presenter''s questioner (QX on I3) travels with them to the new date');

-- ═══ meetings_remove_week (inverse of insert) ═══════════════════════════════
-- non-admin cannot remove
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_remove_week(
       (select id from public.meetings where year = 2031 and scheduled_date = '2031-03-05' and presenter_user_id is null)) $$,
  '42501', NULL, 'a non-admin cannot call meetings_remove_week');
reset role;

-- cannot remove a holiday; then remove the inserted blank -> should restore state
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_remove_week('dddddddd-0000-0000-0000-000000000003') $$,
  'P0001', '不能刪除假期週', 'cannot remove a holiday week');
select public.meetings_remove_week(
  (select id from public.meetings where year = 2031 and scheduled_date = '2031-03-05' and presenter_user_id is null));
reset role;

select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000001'),
  '2031-03-05'::date,
  'remove pulls I1 back to its original date (inverse of insert)');
select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000002'),
  '2031-03-12'::date,
  'remove pulls I2 back to its original date');
select is(
  (select scheduled_date from public.meetings where id = 'dddddddd-0000-0000-0000-000000000004'),
  '2031-03-26'::date,
  'remove pulls I3 back to its original date');
select is(
  (select count(*)::int from public.meetings where year = 2031),
  4,
  'insert then remove leaves the original row count (blank + trailing week gone)');
select ok(
  exists (
    select 1 from public.meeting_questioners
    where meeting_id = 'dddddddd-0000-0000-0000-000000000004'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000031'),
  'QX still rides with I3 after the pull-up');

-- ═══ swap moves the reading-list paper with the presenter ═══════════════════
-- Only meaningful once the schema has teacher_paper_id + the cooldown constraint
-- (reading-list migration). Verifies paper follows the presenter across a swap
-- and the mirrored paper_title tracks it via the sync trigger.
insert into public.teacher_papers (id, provided_date, paper_name, file_link) values
  ('eeeeeeee-0000-0000-0000-000000000001', '2035-01-01', 'Paper Alpha', 'http://x/alpha'),
  ('eeeeeeee-0000-0000-0000-000000000002', '2035-01-01', 'Paper Beta', 'http://x/beta');
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('ffffffff-0000-0000-0000-000000000001', 2035, '第1週', '2035-03-02', false, 'P1', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ffffffff-0000-0000-0000-000000000002', 2035, '第2週', '2035-03-09', false, 'P2', 'aaaaaaaa-0000-0000-0000-000000000003');
update public.meetings set teacher_paper_id = 'eeeeeeee-0000-0000-0000-000000000001' where id = 'ffffffff-0000-0000-0000-000000000001';
update public.meetings set teacher_paper_id = 'eeeeeeee-0000-0000-0000-000000000002' where id = 'ffffffff-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_swap('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002');
reset role;

select is(
  (select teacher_paper_id from public.meetings where id = 'ffffffff-0000-0000-0000-000000000001'),
  'eeeeeeee-0000-0000-0000-000000000002'::uuid,
  'paper follows the presenter: row A now holds B''s reading-list paper');
select is(
  (select teacher_paper_id from public.meetings where id = 'ffffffff-0000-0000-0000-000000000002'),
  'eeeeeeee-0000-0000-0000-000000000001'::uuid,
  'row B now holds A''s reading-list paper');
select is(
  (select presenter_user_id from public.meetings where id = 'ffffffff-0000-0000-0000-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  'the presenter swapped together with the paper (one presentation bundle)');
select is(
  (select paper_title from public.meetings where id = 'ffffffff-0000-0000-0000-000000000001'),
  'Paper Beta',
  'the mirrored paper_title tracks the swapped teacher_paper_id via the sync trigger');

-- ═══ insert mints the trailing week from the last PRESENTATION, not a later
-- ═══ holiday (regression for the unfiltered max(scheduled_date) bug) ═════════
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 2036, '第1週', '2036-03-05', false, 'PA', 'aaaaaaaa-0000-0000-0000-000000000021'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 2036, '第2週', '2036-03-12', false, 'PB', 'aaaaaaaa-0000-0000-0000-000000000022'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 2036, '暑假', '2036-06-20', true,  null, null); -- holiday AFTER the last meeting

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_insert_week('bbbbbbbb-0000-0000-0000-000000000001');
reset role;

select is(
  (select scheduled_date from public.meetings where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  '2036-03-19'::date,
  'trailing week is minted from the last presentation (3/12 + 7), NOT the later holiday (6/20 + 7)');
select is(
  (select scheduled_date from public.meetings where id = 'bbbbbbbb-0000-0000-0000-000000000003'),
  '2036-06-20'::date,
  'the trailing holiday stays anchored to its real date');

-- ═══ speaker weeks (外部講者演講) ════════════════════════════════════════════
-- A speaker week (is_speaker=true) is an anchored calendar event with no
-- presenter_user_id — like a holiday it can't be claimed / swapped / shifted,
-- but unlike a holiday it carries content. Year 2032 (Wednesday cadence) with a
-- speaker (SK, 3/10) sitting between student weeks S1/S2/S3.
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, is_speaker, presenter, presenter_user_id) values
  ('99999999-0000-0000-0000-000000000001', 2032, '第1週', '2032-03-03', false, false, 'PA', 'aaaaaaaa-0000-0000-0000-000000000021'), -- S1
  ('99999999-0000-0000-0000-000000000002', 2032, '演講',  '2032-03-10', false, true,  '吳凱強老師', null),                          -- SK (speaker)
  ('99999999-0000-0000-0000-000000000003', 2032, '第2週', '2032-03-17', false, false, 'PB', 'aaaaaaaa-0000-0000-0000-000000000022'), -- S2
  ('99999999-0000-0000-0000-000000000004', 2032, '第3週', '2032-03-24', false, false, 'PC', 'aaaaaaaa-0000-0000-0000-000000000023'); -- S3

-- CHECK: a row cannot be both holiday and speaker
select throws_ok(
  $$ insert into public.meetings (year, scheduled_date, is_holiday, is_speaker)
     values (2099, '2099-01-01', true, true) $$,
  '23514', NULL, 'a row cannot be both holiday and speaker (CHECK meetings_type_mutex)');

-- a speaker week cannot be claimed (any authenticated user)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_claim('99999999-0000-0000-0000-000000000002') $$,
  'P0001', '演講週無法認領', 'a speaker week cannot be claimed');
reset role;

-- admin-gated: a speaker week can't be swapped, inserted-at, or removed
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_swap('99999999-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000001') $$,
  'P0001', '演講週不可互換', 'a speaker week cannot be swapped');
select throws_ok(
  $$ select public.meetings_insert_week('99999999-0000-0000-0000-000000000002') $$,
  'P0001', '不能在演講週插入', 'cannot insert at a speaker week');
select throws_ok(
  $$ select public.meetings_remove_week('99999999-0000-0000-0000-000000000002') $$,
  'P0001', '不能刪除演講週', 'cannot remove a speaker week');

-- insert at S1: postpone student weeks; the speaker week stays anchored
select public.meetings_insert_week('99999999-0000-0000-0000-000000000001');
reset role;

select is(
  (select scheduled_date from public.meetings where id = '99999999-0000-0000-0000-000000000002'),
  '2032-03-10'::date,
  'the speaker week stays anchored to its real date through an insert');
select is(
  (select scheduled_date from public.meetings where id = '99999999-0000-0000-0000-000000000001'),
  '2032-03-17'::date,
  'S1 is postponed past the anchored speaker week (jumps 3/03 -> 3/17)');
select is(
  (select scheduled_date from public.meetings where id = '99999999-0000-0000-0000-000000000004'),
  '2032-03-31'::date,
  'the trailing week is minted from the last presentation (3/24 + 7), not the speaker week');
select is(
  (select count(*)::int from public.meetings
   where year = 2032 and scheduled_date = '2032-03-03' and presenter_user_id is null
     and not is_holiday and not is_speaker),
  1,
  'a blank presentation week is inserted at the freed earliest slot');

-- remove the inserted blank: student weeks pull back, speaker still anchored
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_remove_week(
  (select id from public.meetings
   where year = 2032 and scheduled_date = '2032-03-03' and presenter_user_id is null and not is_speaker));
reset role;

select is(
  (select scheduled_date from public.meetings where id = '99999999-0000-0000-0000-000000000002'),
  '2032-03-10'::date,
  'the speaker week is still anchored after the pull-up');
select is(
  (select scheduled_date from public.meetings where id = '99999999-0000-0000-0000-000000000001'),
  '2032-03-03'::date,
  'remove pulls S1 back to its original date (insert/remove is the inverse, speaker untouched)');
select is(
  (select count(*)::int from public.meetings where year = 2032),
  4,
  'insert then remove leaves the original 2032 row count (speaker week never counted)');

select * from finish();
rollback;
