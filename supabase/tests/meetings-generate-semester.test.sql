-- meetings_generate_semester regression suite — runs via `supabase test db`.
-- Mirrors meeting-schedule.test.sql conventions: seed as superuser (bypasses
-- RLS), impersonate by switching to the `authenticated` role + setting
-- request.jwt.claims (what is_meetings_admin reads), assert with pgTAP as
-- superuser (reset role). All dates are explicit literals; the generate calls
-- use a THURSDAY cadence (2040-09-06 …) on purpose, to prove the weekly step
-- preserves the start date's own weekday rather than hard-coding Monday.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(34);

-- ── actors ──────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'), -- admin (meetings admin)
  ('aaaaaaaa-0000-0000-0000-000000000009'), -- ordinary non-admin
  ('aaaaaaaa-0000-0000-0000-000000000002'); -- P1 (existing presenter for skip test)

insert into public.user_profiles (id, email, name, roles) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@test.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'non@test.local', 'Non Admin', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'p1@test.local', 'P1', '{}'::jsonb);

-- ═══ auth / validation guards ═══════════════════════════════════════════════
-- non-admin cannot generate
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_generate_semester(2040, '2040-09-06', 4, '[]'::jsonb) $$,
  '42501', NULL, 'a non-admin cannot call meetings_generate_semester');
reset role;

-- admin-gated parameter validation (reached only after the admin check passes)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_generate_semester(2040, '2040-09-06', 0, '[]'::jsonb) $$,
  'P0001', '週數必須介於 1 與 60 之間', 'rejects p_weeks below 1');
select throws_ok(
  $$ select public.meetings_generate_semester(2040, '2040-09-06', 61, '[]'::jsonb) $$,
  'P0001', '週數必須介於 1 與 60 之間', 'rejects p_weeks above 60');
select throws_ok(
  $$ select public.meetings_generate_semester(2040, NULL::date, 4, '[]'::jsonb) $$,
  'P0001', '缺少起始日期', 'rejects a null start date');
reset role;

-- ═══ basic 4-week generate (Thursday start, no holidays) ════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table gen_basic as
  select public.meetings_generate_semester(2040, '2040-09-06', 4, '[]'::jsonb) as ret;
reset role;

select is((select (ret->>'inserted')::int from gen_basic), 4, 'basic generate reports 4 inserted');
select is(
  (select count(*)::int from public.meetings where year = 2040),
  4, 'basic generate creates exactly 4 rows');
select is(
  (select week_label from public.meetings where year = 2040 and scheduled_date = '2040-09-06'),
  '第1週', 'first week is labelled 第1週 at the start date');
select is(
  (select week_label from public.meetings where year = 2040 and scheduled_date = '2040-09-27'),
  '第4週', 'week 4 lands on start + 21 days, labelled 第4週');
select is(
  (select to_char(scheduled_date, 'Dy') from public.meetings where year = 2040 and week_label = '第4週'),
  'Thu', 'the weekly step preserves the start weekday (Thursday, not a hard-coded Monday)');
select is(
  (select count(*)::int from public.meetings where year = 2040 and (is_holiday or presenter is not null)),
  0, 'no-holiday generate leaves every week non-holiday with no presenter');

-- ═══ holidays applied, neighbours stay normal ═══════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- two on-cadence holidays (weeks 2 & 4) + one off-cadence date (a Friday that is
-- not any generated week) to prove non-matching holidays are silently ignored.
select public.meetings_generate_semester(
  2041, '2041-09-05', 4,
  '[{"date":"2041-09-12","label":"月考週"},{"date":"2041-09-26","label":"教師節"},{"date":"2041-09-13","label":"颱風假"}]'::jsonb);
reset role;

select is(
  (select week_label from public.meetings where year = 2041 and scheduled_date = '2041-09-12'),
  '第2週(月考週)', 'a holiday week carries its number and reason: 第2週(月考週)');
select is(
  (select is_holiday from public.meetings where year = 2041 and scheduled_date = '2041-09-12'),
  true, 'a listed date is flagged is_holiday');
select is(
  (select presenter from public.meetings where year = 2041 and scheduled_date = '2041-09-12'),
  NULL, 'a holiday week has no presenter (reason lives in week_label)');
select is(
  (select week_label from public.meetings where year = 2041 and scheduled_date = '2041-09-26'),
  '第4週(教師節)', 'the SECOND listed holiday is also applied: 第4週(教師節)');
select is(
  (select is_holiday from public.meetings where year = 2041 and scheduled_date = '2041-09-26'),
  true, 'the second holiday date is flagged is_holiday too');
select is(
  (select week_label from public.meetings where year = 2041 and scheduled_date = '2041-09-19'),
  '第3週', 'a week not in the holiday list stays a plain 第N週');
select is(
  (select is_holiday from public.meetings where year = 2041 and scheduled_date = '2041-09-19'),
  false, 'a week not in the holiday list is not a holiday');
select is(
  (select count(*)::int from public.meetings where year = 2041 and scheduled_date = '2041-09-13'),
  0, 'an off-cadence holiday date (matches no generated week) is silently ignored');
select is(
  (select count(*)::int from public.meetings where year = 2041),
  4, 'exactly 4 rows generated for 2041 — no phantom row from the off-cadence holiday');

-- ═══ skip existing rows (never overwrite), then idempotent re-run ═══════════
insert into public.meetings (year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
values (2042, '第1週', '2042-09-04', false, '既有報告人', 'aaaaaaaa-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table gen_skip as
  select public.meetings_generate_semester(2042, '2042-09-04', 3, '[]'::jsonb) as ret;
reset role;

select is((select (ret->>'inserted')::int from gen_skip), 2, 'skips the one existing date, inserts the other 2');
select is((select (ret->>'skipped')::int from gen_skip), 1, 'reports 1 skipped');
select is(
  (select presenter from public.meetings where year = 2042 and scheduled_date = '2042-09-04'),
  '既有報告人', 'the pre-existing presenter is never overwritten');
select is(
  (select week_label from public.meetings where year = 2042 and scheduled_date = '2042-09-11'),
  '第2週', 'numbering stays continuous across the skipped week (第2週, not restarted at 第1週)');
select is(
  (select count(*)::int from public.meetings where year = 2042),
  3, 'the existing date is not duplicated (3 rows total, not 4)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table gen_again as
  select public.meetings_generate_semester(2042, '2042-09-04', 3, '[]'::jsonb) as ret;
reset role;

select is((select (ret->>'inserted')::int from gen_again), 0, 're-running the same generate inserts nothing (idempotent)');
select is((select (ret->>'skipped')::int from gen_again), 3, 're-running reports all 3 dates skipped');

-- ═══ the semester records the plan it was generated from ════════════════════
-- The basic 4-week generate at the top of this file opened 上學期 129
-- (2040-09-06 → ROC academic year 129, term 1) on a semester that did not exist
-- yet, so generate got to stamp its own metadata onto it.
select is(
  (select planned_weeks from public.meeting_semesters where academic_year = 129 and term = 1),
  4,
  'the generated semester records the p_weeks it was generated with (planned_weeks = 4)');

-- ═══ two semesters in ONE `year` bucket each restart at 第1週 (第17週 fix) ════
-- Both calls pass the same p_year, which is exactly the situation that used to
-- run one continuous counter over a calendar year and overflow past 第16週.
-- 2050-09-01 → 上學期 139; 2051-02-17 → 下學期 139.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_generate_semester(2050, '2050-09-01', 3, '[]'::jsonb);
select public.meetings_generate_semester(2050, '2051-02-17', 3, '[]'::jsonb);
reset role;

select is(
  (select string_agg(week_label, ',' order by scheduled_date) from public.meetings
   where semester_id = (select id from public.meeting_semesters where academic_year = 139 and term = 1)),
  '第1週,第2週,第3週',
  '上學期 139 is numbered 第1週..第3週');
select is(
  (select string_agg(week_label, ',' order by scheduled_date) from public.meetings
   where semester_id = (select id from public.meeting_semesters where academic_year = 139 and term = 2)),
  '第1週,第2週,第3週',
  '下學期 139 restarts at 第1週 despite sharing the year 2050 bucket (no 第17週 overflow)');
select isnt(
  (select semester_id from public.meetings where scheduled_date = '2051-02-17'),
  (select semester_id from public.meetings where scheduled_date = '2050-09-01'),
  'the two generated semesters carry different semester_ids');

-- ═══ regenerating a semester from a shifted start date adds nothing ═════════
-- Same semester (2050-09-02 is still 上學期 139), one day later, so not one date
-- collides — but every WEEK NUMBER is already taken. Re-running must not lay a
-- second 第1週 beside the first; the shifted rows come back as `skipped`.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table gen_shifted as
  select public.meetings_generate_semester(2050, '2050-09-02', 3, '[]'::jsonb) as ret;
reset role;

select is((select (ret->>'inserted')::int from gen_shifted), 0,
  'a shifted-start regenerate of the same semester inserts nothing');
select is((select (ret->>'skipped')::int from gen_shifted), 3,
  'all 3 shifted rows are reported as skipped');
select is(
  (select count(*)::int from public.meetings
   where semester_id = (select id from public.meeting_semesters where academic_year = 139 and term = 1)),
  3,
  '上學期 139 still holds exactly 3 weeks — no second 第1週 was created');
select is(
  (select string_agg(to_char(scheduled_date, 'YYYY-MM-DD') || '=' || week_label, ',' order by scheduled_date)
   from public.meetings
   where semester_id = (select id from public.meeting_semesters where academic_year = 139 and term = 1)),
  '2050-09-01=第1週,2050-09-08=第2週,2050-09-15=第3週',
  'the pre-existing dates and labels are left exactly as they were');

select * from finish();
rollback;
