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

select plan(19);

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
select public.meetings_generate_semester(
  2041, '2041-09-05', 4,
  '[{"date":"2041-09-12","label":"月考週"},{"date":"2041-09-26","label":"教師節"}]'::jsonb);
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
  (select week_label from public.meetings where year = 2041 and scheduled_date = '2041-09-19'),
  '第3週', 'a week not in the holiday list stays a plain 第N週');
select is(
  (select is_holiday from public.meetings where year = 2041 and scheduled_date = '2041-09-19'),
  false, 'a week not in the holiday list is not a holiday');

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
  (select count(*)::int from public.meetings where year = 2042),
  3, 'the existing date is not duplicated (3 rows total, not 4)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table gen_again as
  select public.meetings_generate_semester(2042, '2042-09-04', 3, '[]'::jsonb) as ret;
reset role;

select is((select (ret->>'inserted')::int from gen_again), 0, 're-running the same generate inserts nothing (idempotent)');

select * from finish();
rollback;
