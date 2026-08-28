-- meeting_semesters regression suite — runs via `supabase test db`.
--
-- Covers the semester entity that stops 第N週 from overflowing past 第16週:
-- the ROC-academic-year derivation helpers, the (academic_year, term) unique
-- key, the term CHECK, the BEFORE INSERT safety net on public.meetings, and
-- the table's RLS (everyone reads, only a meetings admin writes).
--
-- Conventions mirror meeting-schedule.test.sql: seed as superuser (bypasses
-- RLS), impersonate by switching to the `authenticated` role + setting
-- request.jwt.claims (what auth.uid() / is_meetings_admin() read), then
-- `reset role;` so the pgTAP assertions inspect the tables directly.
--
-- All dates are explicit literals in years far enough out that no other test
-- file's fixtures can collide with the semesters they mint.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(27);

-- ── actors ──────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('eeeeeeee-0000-0000-0000-000000000001'), -- admin (meetings admin)
  ('eeeeeeee-0000-0000-0000-000000000009'); -- ordinary non-admin

insert into public.user_profiles (id, email, name, roles) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'sem-admin@test.local', 'Sem Admin', '{"meetings":["admin"]}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000009', 'sem-non@test.local',   'Sem Non',   '{}'::jsonb);

-- ═══ 1. derivation helpers ══════════════════════════════════════════════════
-- The academic year rolls over in AUGUST (September is the first teaching
-- month), so a January meeting still belongs to the PREVIOUS ROC year and to
-- 上學期. These six dates are the spec's boundary cases.
select is(public.meeting_academic_year('2025-09-08'::date), 114,
  '2025-09-08 is ROC academic year 114 (September starts the year)');
select is(public.meeting_term('2025-09-08'::date), 1::smallint,
  '2025-09-08 is 上學期 (term 1)');

select is(public.meeting_academic_year('2025-12-29'::date), 114,
  '2025-12-29 is still academic year 114');
select is(public.meeting_term('2025-12-29'::date), 1::smallint,
  '2025-12-29 is still 上學期 (December)');

select is(public.meeting_academic_year('2026-01-05'::date), 114,
  '2026-01-05 belongs to academic year 114 — January is before the August rollover');
select is(public.meeting_term('2026-01-05'::date), 1::smallint,
  '2026-01-05 is still 上學期 — January is the tail of the first term, not the start of the second');

select is(public.meeting_academic_year('2026-02-16'::date), 114,
  '2026-02-16 is academic year 114');
select is(public.meeting_term('2026-02-16'::date), 2::smallint,
  '2026-02-16 is 下學期 (term 2)');

select is(public.meeting_academic_year('2026-07-01'::date), 114,
  '2026-07-01 is the tail of academic year 114');
select is(public.meeting_term('2026-07-01'::date), 2::smallint,
  '2026-07-01 is still 下學期 (July)');

select is(public.meeting_academic_year('2026-08-31'::date), 115,
  '2026-08-31 has already rolled over into academic year 115 (August boundary)');
select is(public.meeting_term('2026-08-31'::date), 1::smallint,
  '2026-08-31 is 上學期 of the new year');

-- ═══ 2. one row per (academic_year, term) ═══════════════════════════════════
-- A semester is the unit week numbering restarts on, so a duplicated
-- (year, term) would silently split one semester into two numbering series.
insert into public.meeting_semesters (academic_year, term, start_date, planned_weeks)
values (200, 1, '2111-09-04', 16);

select throws_ok(
  $$ insert into public.meeting_semesters (academic_year, term, start_date)
     values (200, 1, '2111-09-11') $$,
  '23505', null,
  'a second row with the same (academic_year, term) is rejected by the unique key');

-- ═══ 3. term is 1 or 2 ══════════════════════════════════════════════════════
select throws_ok(
  $$ insert into public.meeting_semesters (academic_year, term, start_date)
     values (201, 3, '2112-09-02') $$,
  '23514', null,
  'term = 3 is rejected — a ROC academic year has exactly two terms');

-- ═══ 4. the BEFORE INSERT safety net fills semester_id ══════════════════════
-- A meeting inserted by any path that predates this feature (a hand-written
-- INSERT, an old RPC) must still land in a semester rather than fail the NOT
-- NULL. 2035-09-05 → academic year 124, 上學期.
insert into public.meetings (year, week_label, scheduled_date, is_holiday)
values (2035, '第1週', '2035-09-05', false);

select isnt(
  (select semester_id from public.meetings where scheduled_date = '2035-09-05'),
  null,
  'a meeting inserted without semester_id gets one from the safety net');
select is(
  (select s.academic_year from public.meetings m
   join public.meeting_semesters s on s.id = m.semester_id
   where m.scheduled_date = '2035-09-05'),
  124,
  'the minted semester is academic year 124 (derived from 2035-09-05)');
select is(
  (select s.term from public.meetings m
   join public.meeting_semesters s on s.id = m.semester_id
   where m.scheduled_date = '2035-09-05'),
  1::smallint,
  'the minted semester is 上學期');

-- ═══ 5. find-or-create groups by semester, not by row ══════════════════════
insert into public.meetings (year, week_label, scheduled_date, is_holiday) values
  (2036, '第1週', '2036-09-07', false),  -- academic year 125, term 1
  (2036, '第5週', '2036-10-05', false),  -- academic year 125, term 1 (same semester)
  (2037, '第1週', '2037-03-02', false);  -- academic year 125, term 2 (different semester)

select is(
  (select count(distinct semester_id)::int from public.meetings
   where scheduled_date in ('2036-09-07', '2036-10-05')),
  1,
  'two meetings inside one semester share a single semester_id (find-or-create, not create-always)');
select isnt(
  (select semester_id from public.meetings where scheduled_date = '2037-03-02'),
  (select semester_id from public.meetings where scheduled_date = '2036-09-07'),
  '下學期 of the same academic year is a DIFFERENT semester');

-- ═══ 6. an explicitly supplied semester_id always wins ═════════════════════
-- This is the guard that keeps an appended week inside its original semester.
-- 2042-04-01 derives to (130, 2), but the caller says (130, 1) — the caller
-- knows which semester it is extending, the date-derived guess does not.
insert into public.meeting_semesters (id, academic_year, term, start_date, planned_weeks)
values ('eeeeeeee-0000-0000-0000-0000000000f1', 130, 1, '2041-09-02', 16);

insert into public.meetings (year, week_label, scheduled_date, is_holiday, semester_id)
values (2042, '第20週', '2042-04-01', false, 'eeeeeeee-0000-0000-0000-0000000000f1');

select is(
  (select semester_id from public.meetings where scheduled_date = '2042-04-01'),
  'eeeeeeee-0000-0000-0000-0000000000f1'::uuid,
  'the safety net never overwrites a supplied semester_id, even when the date says otherwise');

-- ═══ 7. RLS: everyone reads, only a meetings admin writes ══════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000009","role":"authenticated"}', true);

select isnt(
  (select count(*)::int from public.meeting_semesters), 0,
  'a non-admin can read meeting_semesters (semester rows group meetings they can already read)');

select throws_ok(
  $$ insert into public.meeting_semesters (academic_year, term, start_date)
     values (900, 1, '2811-09-01') $$,
  '42501', null,
  'a non-admin cannot insert a semester');

-- RLS UPDATE / DELETE are silent no-ops (0 rows matched), not privilege
-- errors — the USING clause filters the row out before anything is written.
update public.meeting_semesters set planned_weeks = 99 where academic_year = 200;
select is(
  (select planned_weeks from public.meeting_semesters where academic_year = 200 and term = 1),
  16,
  'a non-admin UPDATE on a semester is a no-op under RLS');

delete from public.meeting_semesters where academic_year = 200;
select is(
  (select count(*)::int from public.meeting_semesters where academic_year = 200 and term = 1),
  1,
  'a non-admin DELETE on a semester is a no-op under RLS');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- INSERT is the one write RLS turns into a hard 42501, so lives_ok proves it.
-- UPDATE / DELETE would "live" even if RLS silently matched zero rows, so those
-- two are asserted on their effect instead.
select lives_ok(
  $$ insert into public.meeting_semesters (academic_year, term, start_date, planned_weeks)
     values (901, 1, '2812-09-01', 16) $$,
  'a meetings admin can insert a semester');

update public.meeting_semesters set planned_weeks = 18 where academic_year = 901 and term = 1;
select is(
  (select planned_weeks from public.meeting_semesters where academic_year = 901 and term = 1),
  18,
  'a meetings admin''s UPDATE on a semester actually lands');

delete from public.meeting_semesters where academic_year = 901 and term = 1;
select is(
  (select count(*)::int from public.meeting_semesters where academic_year = 901),
  0,
  'a meetings admin''s DELETE on a semester actually lands');
reset role;

select * from finish();
rollback;
