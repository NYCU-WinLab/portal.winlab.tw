-- Regression suite for the three bugs 20260915080357 fixed by deriving both
-- the calendar year and the academic semester from meetings.scheduled_date
-- instead of trusting meetings.year / meetings.semester_id (now gone):
--
--   1. an insert that pushed a presenter past 12/31 left them stamped with
--      last year's `year`, so they vanished from next year's page;
--   2. a guessed, stored semester_id let the trailing-slot search step over
--      the OTHER semester's real content, interleaving the two;
--   3. the Nextcloud recording matcher followed scheduled_date while the row
--      filter followed the stale `year`, so a cross-year recording never
--      linked.
--
-- Same conventions as meeting-schedule.test.sql: seed as superuser (bypasses
-- RLS), impersonate by switching to `authenticated` + setting
-- request.jwt.claims (what is_meetings_admin() reads), assert as superuser
-- (reset role) for direct-table verification.
--
-- ── CALENDAR YEARS 2061-2066 ONLY ────────────────────────────────────────────
-- Checked at the time of writing by grepping every other suite for `20\d\d-`
-- date literals: the other 23 files' fixture years range from 2018 through
-- 2099 but cluster in a handful of bands nowhere near this one (2020s, 2030s,
-- low-2040s to low-2050s, low-2090s). This file shares one database with all
-- of them; a year collision would silently corrupt another file's fixture. The
-- exact occupied set will drift as suites are added or edited — re-grep
-- before reusing years anywhere near this range rather than trusting this
-- note to still be exhaustive.
--
-- ── FIXTURE ORDERING IS LOAD-BEARING (same rule as meeting-schedule.test.sql) ─
-- meetings_insert_week/meetings_append_week shift or scan every PRESENTATION
-- row at or after a date, with no semester or year bound. Groups below are
-- seeded and mutated in strictly increasing date order, and each group's
-- shifting RPC calls happen before the next group's rows exist — otherwise an
-- earlier group's shift would reach into a later group and drag its rows too.
--
-- ── GROUP 1 (academic year 150, 2061-08 .. 2062-07): bugs 1, 2, 3 ───────────
-- One continuous weekly chain R1..R8 (7 days apart) deliberately built to
-- cross both boundaries the old model disagreed about:
--   R1 2061-12-15  R2 2061-12-22  R3 2061-12-29  R4 2062-01-05
--   R5 2062-01-12  R6 2062-01-19  R7 2062-01-26  R8 2062-02-02
--   H  2062-02-09  (anchored 春節 holiday, one slot past R8 -- see below)
-- R1..R7 sit inside 上學期 150's own window (8/1-1/31); R8 already sits one
-- day into 下學期 150 (2/1-7/31) -- a semester's tail is allowed to run past
-- 1/31 (see meeting-schedule.test.sql's 2049 case), and that is exactly the
-- shape bug 2 needs: a CONTENT row already living on the far side of the
-- semester line, in the same chain as everything before it.
--
-- meetings_insert_week(R1) shifts the WHOLE chain down one slot: R2 takes R1's
-- neighbor's date, ..., R7 (last inside 上學期) takes R8's old date 2062-02-02
-- -- i.e. a content row is pulled ACROSS the 1/31 line, not left behind (bug
-- 2's regression: the old semester-scoped shift would have excluded it,
-- leaving it at 1/26 while the newly-minted tail collided with it at 2/02).
-- R8 itself needs a fresh trailing date; 2062-02-09 already belongs to the
-- anchored holiday H, so the mint must step past it to 2062-02-16 without
-- moving H (bug 3's regression: H is not a presentation row, so it never
-- joins the moving set, but it still occupies a date the trailing scan must
-- detect and skip).
--
-- R3 (a presenter, not a blank) is what proves bug 1: it starts on
-- 2061-12-29 and the shift lands it on 2062-01-05 -- a presenter pushed
-- across the calendar year line. Under the old model meetings.year on that
-- row was stamped once at creation and never moved with it; under this model
-- there is nothing but scheduled_date to disagree with, so the row's
-- calendar-year membership is exactly what its date says.
--
-- A second meetings_insert_week, targeted at R3's now-current position
-- (2062-01-05), frees a BLANK row at that exact date -- the concrete case the
-- migration's own comment names ("被推過年底的那個人現在真的會被算進新的一
-- 年"): meetings_fill_presenters(2062) must find and fill it, proving the
-- 2062 calendar-year bucket a real consumer queries is built from
-- scheduled_date alone.
--
-- ── GROUP 2 (academic year 151): 第N週 restarts per SEMESTER, not per year ──
-- Two lone rows sharing academic_year 151 but opposite terms: 上學期's 第10週
-- (2062-08-01) and 下學期's 第14週 (2063-02-01). Both terms report the SAME
-- meeting_academic_year(), so a mint that scoped by academic_year alone
-- (dropping the date-window check) would see both and mint 第15週. A mint
-- scoped by the semester's actual date window sees only 第10週 from inside
-- 上學期's own window and mints 第11週. 第11週 vs 第15週 is the divergence
-- that makes this assertion sharp rather than incidental.
--
-- ── GROUP 3 (academic year 152): the 16-week ceiling, both terms ────────────
-- 上學期's 第16週 (2063-08-01) and 下學期's 第16週 (2064-02-01), each alone in
-- its own window. Minting again inside either window must return the term's
-- own holiday label (寒假 / 暑假), not 第17週.
--
-- ── GROUP 4 (academic year 153): append_week refuses to cross into the next
-- semester ───────────────────────────────────────────────────────────────
-- 上學期 153 holds one row, 第15週 (2065-01-27) -- the only row anywhere in
-- academic year 153. meetings_append_week(153, 1) continues from 2065-01-27,
-- and next_free_date's +7 lands on 2065-02-03: past 1/31, inside 下學期 153's
-- window. append_week now checks the new date against its own v_from..v_to
-- before inserting anything, so a call bound to 上學期 that would land past
-- 1/31 raises P0001 instead of minting a 下學期 label (第1週) under a 上學期
-- call -- the wrong-semester row this group used to lock in.
--
-- ── GROUP 5 (academic year 154, 下學期): the same guard's ALLOWED boundary ──
-- GROUP 4 only proves the `v_new_date > v_to` raise fires. It says nothing
-- about `>=` vs `>` at the guard itself -- a mutant that tightened the raise
-- to `>=` would block a perfectly legal append landing exactly on the
-- semester's own last day and still pass every other assertion in this file.
-- 下學期 154 (2066-02-01..2066-07-31) holds one row one week short of the
-- window's last day, so the mint's own +7 lands EXACTLY on v_to (2066-07-31)
-- with nothing in the way: append_week must succeed, not raise.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(12);

-- ── actors ───────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('a1a10000-0000-0000-0000-000000000001'), -- admin (meetings admin)
  ('a1a10000-0000-0000-0000-000000000002'), -- P1
  ('a1a10000-0000-0000-0000-000000000003'), -- P2
  ('a1a10000-0000-0000-0000-000000000004'), -- P3 (crosses the calendar year)
  ('a1a10000-0000-0000-0000-000000000005'), -- P4
  ('a1a10000-0000-0000-0000-000000000006'), -- P5
  ('a1a10000-0000-0000-0000-000000000007'), -- P6
  ('a1a10000-0000-0000-0000-000000000008'), -- P7 (crosses the semester line)
  ('a1a10000-0000-0000-0000-000000000009'), -- P8 (crosses the anchored holiday)
  ('a1a10000-0000-0000-0000-00000000000a'); -- PZ (sole presenter-pool member)

insert into public.user_profiles (id, email, name, roles) values
  ('a1a10000-0000-0000-0000-000000000001', 'a1admin@test.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000002', 'a1p1@test.local', 'P1', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000003', 'a1p2@test.local', 'P2', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000004', 'a1p3@test.local', 'P3', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000005', 'a1p4@test.local', 'P4', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000006', 'a1p5@test.local', 'P5', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000007', 'a1p6@test.local', 'P6', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000008', 'a1p7@test.local', 'P7', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-000000000009', 'a1p8@test.local', 'P8', '{}'::jsonb),
  ('a1a10000-0000-0000-0000-00000000000a', 'a1pz@test.local', 'PZ', '{}'::jsonb);

update public.user_profiles set lab_status = 'master' where lab_status is null;

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order) values
  ('a1a10000-0000-0000-0000-00000000000a', 150, 1);

-- ── GROUP 1 fixture: the cross-year, cross-semester chain + anchored holiday ─
insert into public.meetings (id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('b1b10000-0000-0000-0000-000000000001', '第1週', '2061-12-15', false, 'P1', 'a1a10000-0000-0000-0000-000000000002'), -- R1
  ('b1b10000-0000-0000-0000-000000000002', '第2週', '2061-12-22', false, 'P2', 'a1a10000-0000-0000-0000-000000000003'), -- R2
  ('b1b10000-0000-0000-0000-000000000003', '第3週', '2061-12-29', false, 'P3', 'a1a10000-0000-0000-0000-000000000004'), -- R3
  ('b1b10000-0000-0000-0000-000000000004', '第4週', '2062-01-05', false, 'P4', 'a1a10000-0000-0000-0000-000000000005'), -- R4
  ('b1b10000-0000-0000-0000-000000000005', '第5週', '2062-01-12', false, 'P5', 'a1a10000-0000-0000-0000-000000000006'), -- R5
  ('b1b10000-0000-0000-0000-000000000006', '第6週', '2062-01-19', false, 'P6', 'a1a10000-0000-0000-0000-000000000007'), -- R6
  ('b1b10000-0000-0000-0000-000000000007', '第7週', '2062-01-26', false, 'P7', 'a1a10000-0000-0000-0000-000000000008'), -- R7
  ('b1b10000-0000-0000-0000-000000000008', '第8週', '2062-02-02', false, 'P8', 'a1a10000-0000-0000-0000-000000000009'), -- R8 (already past 1/31)
  ('b1b10000-0000-0000-0000-000000000009', '春節',  '2062-02-09', true,  null, null);                                    -- H (anchored, blocks the mint)

-- admin shifts the whole chain from R1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_insert_week('b1b10000-0000-0000-0000-000000000001');
reset role;

-- bug 1: P3 (unchanged identity, unchanged presenter) is now scheduled in
-- 2062, not 2061. A shift-loop indexing bug that left this row on its own
-- original date (instead of taking the next slot's date) would keep it in
-- 2061-12 and fail this.
select is(
  (select scheduled_date from public.meetings where id = 'b1b10000-0000-0000-0000-000000000003'),
  '2062-01-05'::date,
  'bug 1: a presenter pushed by insert lands in the correct calendar year (Dec 2061 -> Jan 2062)');

-- bug 2: R6 takes R7's old slot -- proof the chain is continuous up to the
-- boundary (no gap, no row left behind).
select is(
  (select scheduled_date from public.meetings where id = 'b1b10000-0000-0000-0000-000000000006'),
  '2062-01-26'::date,
  'bug 2: the row just before the semester line shifts into the vacated slot (chain stays continuous)');

-- bug 2: R7 -- the last row that started INSIDE 上學期 -- is pulled across
-- 1/31 onto R8's old (下學期) date. A semester-scoped moving-set filter (the
-- bug's root cause) would exclude R8 from the array, leave R7 trying to mint
-- its own trailing date at 2062-02-02, and collide with R8 still sitting
-- there.
select is(
  (select scheduled_date from public.meetings where id = 'b1b10000-0000-0000-0000-000000000007'),
  '2062-02-02'::date,
  'bug 2: a content row is pulled across the 1/31 semester line, not left behind for the mint to collide with');

-- bug 3: the anchored holiday never joins the moving set and never moves.
select is(
  (select scheduled_date from public.meetings where id = 'b1b10000-0000-0000-0000-000000000009'),
  '2062-02-09'::date,
  'bug 3: the anchored holiday stays put through the shift');

-- bug 3: R8's freshly minted trailing date steps past the holiday's date
-- instead of colliding with it (next_free_date's occupied-date check).
select is(
  (select scheduled_date from public.meetings where id = 'b1b10000-0000-0000-0000-000000000008'),
  '2062-02-16'::date,
  'bug 3: the trailing-slot mint steps over the anchored holiday (2/09 occupied, lands on 2/16)');

-- A second insert, targeted at R3's now-current date, frees a genuinely
-- BLANK row at 2062-01-05 -- exactly the "pushed past year-end" shape bug 1's
-- real consumer (meetings_fill_presenters, scoped by calendar year) has to
-- pick up.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_insert_week(
  (select id from public.meetings where scheduled_date = '2062-01-05'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table g1_fill as
  select public.meetings_fill_presenters(2062) as res;
reset role;

-- bug 1 (the consumer): meetings_fill_presenters(2062) is scoped by
-- `scheduled_date between make_date(2062,1,1) and make_date(2062,12,31)` --
-- if that scope instead relied on a stamped-at-creation value (the old
-- meetings.year bug this migration removes), a row born from a shift would
-- never be reachable under its new year and this would report 0.
select is((select res ->> 'filled' from g1_fill), '1',
  'bug 1: meetings_fill_presenters(2062) finds and fills a row that only exists in 2062 because of the shift');
select is(
  (select presenter_user_id from public.meetings where scheduled_date = '2062-01-05'),
  'a1a10000-0000-0000-0000-00000000000a'::uuid,
  'bug 1: the filled row now belongs to the sole 2062 presenter-pool candidate (proves it was reachable, not orphaned)');

-- ── GROUP 2: 第N週 restarts per semester window, not per academic year ─────
insert into public.meetings (id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('b1b10000-0000-0000-0000-000000000011', '第10週', '2062-08-01', false, null, null), -- 上學期 151
  ('b1b10000-0000-0000-0000-000000000012', '第14週', '2063-02-01', false, null, null); -- 下學期 151 (same academic_year)

-- An academic-year-only scope would see both 第10週 and 第14週 and mint 第15週;
-- the correct date-window scope sees only 上學期's 第10週 and mints 第11週.
select is(
  public.meetings_mint_week_label('2062-09-01'::date),
  '第11週',
  'mint restarts within 上學期''s own window: 下學期''s 第14週 (same academic year) does not push it to 第15週');

-- ── GROUP 3: the 16-week ceiling hands back the term's own holiday label ───
insert into public.meetings (id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('b1b10000-0000-0000-0000-000000000021', '第16週', '2063-08-01', false, null, null), -- 上學期 152
  ('b1b10000-0000-0000-0000-000000000022', '第16週', '2064-02-01', false, null, null); -- 下學期 152

select is(
  public.meetings_mint_week_label('2063-12-01'::date),
  '寒假',
  '上學期 numbering used up (第16週 already exists): mint returns 寒假, not 第17週');
select is(
  public.meetings_mint_week_label('2064-05-01'::date),
  '暑假',
  '下學期 numbering used up (第16週 already exists): mint returns 暑假, not 第17週');

-- ── GROUP 4: append_week refuses to cross into the next semester ──────────
insert into public.meetings (id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('b1b10000-0000-0000-0000-000000000031', '第15週', '2065-01-27', false, null, null); -- 上學期 153, the only row in academic year 153

-- next_free_date (2065-01-27 + 7 = 2065-02-03) lands past 1/31, inside
-- 下學期 153's window -- outside the 上學期 window append_week was asked to
-- extend, so it raises instead of inserting a 下學期-numbered row under a
-- 上學期 call.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_append_week(153, 1::smallint) $$,
  'P0001', NULL,
  'append_week raises instead of landing the new week past 1/31 in the next semester');
reset role;

-- ── GROUP 5 fixture: a mint landing EXACTLY on v_to must succeed ───────────
insert into public.meetings (id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id) values
  ('b1b10000-0000-0000-0000-000000000041', '第15週', '2066-07-24', false, null, null); -- 下學期 154, one week short of 7/31

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table g5_appended as
  select public.meetings_append_week(154, 2::smallint) as id;
reset role;

select is(
  (select scheduled_date from public.meetings where id = (select id from g5_appended)),
  '2066-07-31'::date,
  'a mint landing exactly on the semester''s last day (v_to) succeeds -- the guard is `>`, not `>=`');

select * from finish();
rollback;
