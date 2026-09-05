-- meetings_guard_columns + thesis weeks regression suite — runs via
-- `supabase test db`. Mirrors meeting-schedule.test.sql conventions: seed as
-- superuser (bypasses RLS), impersonate by switching to the `authenticated`
-- role + setting request.jwt.claims (what auth.uid()/is_meetings_admin read),
-- assert with pgTAP as superuser (reset role) for direct-table verification.
--
-- The guard is SILENT by design: a presenter's UPDATE succeeds, it just doesn't
-- move the columns that aren't theirs. So every assertion here reads the stored
-- row back after a successful write rather than expecting an exception.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(24);

-- ── actors ──────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('eeeeeeee-0000-0000-0000-000000000001'), -- meetings admin
  ('eeeeeeee-0000-0000-0000-000000000002'), -- presenter (owns the rows below)
  ('eeeeeeee-0000-0000-0000-000000000003'); -- unrelated member

insert into public.user_profiles (id, email, name, roles) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'gadmin@test.local', 'GAdmin', '{"meetings":["admin"]}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000002', 'gpres@test.local',  'GPres',  '{}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000003', 'gother@test.local', 'GOther', '{}'::jsonb);

insert into public.teacher_papers (id, provided_date, paper_name, file_link) values
  ('ffffffff-0000-0000-0000-000000000001', '2040-01-01', 'Teacher Paper One', 'https://example.org/one.pdf');

-- M1: an ordinary presentation week owned by the presenter, no paper picked yet.
-- M2: a week an admin will flag as a thesis.
-- M3: an unclaimed week, for the claim path.
-- M4: a week in a DIFFERENT semester (2041-09-10 → 上學期 130, while M1–M3 are
--     下學期 128), so the guard test below has a real semester to try to jump to.
insert into public.meetings
  (id, year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id, location, start_time)
values
  ('11111111-0000-0000-0000-000000000001', 2040, '第1週', '2040-03-05', false, 'GPres', 'eeeeeeee-0000-0000-0000-000000000002', 'EC 411', '15:30'),
  ('11111111-0000-0000-0000-000000000002', 2040, '第2週', '2040-03-12', false, 'GPres', 'eeeeeeee-0000-0000-0000-000000000002', 'EC 411', '15:30'),
  ('11111111-0000-0000-0000-000000000003', 2040, '第3週', '2040-03-19', false, null,    null,                                   'EC 411', '15:30'),
  ('11111111-0000-0000-0000-000000000004', 2041, '第1週', '2041-09-10', false, null,    null,                                   'EC 411', '15:30');

-- ═══ the guard: what a presenter may NOT write ══════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);

update public.meetings set
  scheduled_date = '2040-12-25',
  week_label     = 'hijacked',
  location       = 'somewhere else',
  start_time     = '09:00',
  is_speaker     = true,
  presenter      = 'Someone Else',
  paper_title    = 'a title I typed myself',
  paper_link     = 'https://phishing.example/steal',
  semester_id    = (select id from public.meeting_semesters where academic_year = 130 and term = 1)
where id = '11111111-0000-0000-0000-000000000001';
reset role;

select is(
  (select scheduled_date from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  '2040-03-05'::date,
  'a presenter cannot move their own scheduled_date');

select is(
  (select week_label from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  '第1週',
  'a presenter cannot rewrite week_label');

select is(
  (select location from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'EC 411',
  'a presenter cannot rewrite location');

select is(
  (select is_speaker from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  false,
  'a presenter cannot flip their week to a speaker week');

select is(
  (select presenter from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'GPres',
  'a presenter cannot rewrite the denormalized presenter name');

select is(
  (select paper_title from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  NULL,
  'a presenter cannot type a free-form paper_title on an ordinary week (#1079)');

select is(
  (select paper_link from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  NULL,
  'a presenter cannot supply a paper_link — it is never user-writable (#1079)');

-- semester_id is a slot field like week_label: a presenter PATCHing their own row
-- into another semester would renumber that semester's weeks around them.
select is(
  (select semester_id from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  (select id from public.meeting_semesters where academic_year = 128 and term = 2),
  'a presenter cannot move their own row into another semester');

-- ═══ the guard: what a presenter MAY still write ════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.meetings set
  teacher_paper_id = 'ffffffff-0000-0000-0000-000000000001',
  notes            = 'my note',
  ppt_uploaded     = true,
  ppt_link         = 'https://cloud.example/deck.pdf',
  video_uploaded   = true,
  video_link       = 'https://cloud.example/rec.mp4'
where id = '11111111-0000-0000-0000-000000000001';
reset role;

select is(
  (select teacher_paper_id from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'ffffffff-0000-0000-0000-000000000001'::uuid,
  'a presenter can still pick their reading-list paper');

select is(
  (select paper_title from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'Teacher Paper One',
  'picking a paper still mirrors its title (guard runs before the sync trigger)');

select is(
  (select paper_link from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'https://example.org/one.pdf',
  'the mirrored link comes from teacher_papers, not from the caller');

select is(
  (select notes from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'my note',
  'a presenter can still write notes');

select is(
  (select ppt_link from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  'https://cloud.example/deck.pdf',
  'a presenter can still record their uploaded PPT');

-- ═══ admins are untouched ═══════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.meetings set scheduled_date = '2040-03-06'
where id = '11111111-0000-0000-0000-000000000001';
reset role;

select is(
  (select scheduled_date from public.meetings where id = '11111111-0000-0000-0000-000000000001'),
  '2040-03-06'::date,
  'an admin can still move a date');

-- ═══ thesis weeks: key #1 belongs to the admin ══════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.meetings set is_thesis = true, paper_title = 'sneaking a title in'
where id = '11111111-0000-0000-0000-000000000002';
reset role;

select is(
  (select is_thesis from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  false,
  'a presenter cannot flag their own week as a thesis (#1080 key 1)');

select is(
  (select paper_title from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  NULL,
  'flipping is_thesis and typing a title in one statement is not a shortcut');

-- admin flags it
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.meetings set is_thesis = true where id = '11111111-0000-0000-0000-000000000002';
reset role;

select is(
  (select is_thesis from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  true,
  'an admin can flag a thesis week');

-- ═══ thesis weeks: key #2 belongs to the presenter ══════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.meetings set
  paper_title = '  Rate-Assured' || chr(10) || 'Scheduling for GPU Inference  ',
  paper_link  = 'https://phishing.example/steal'
where id = '11111111-0000-0000-0000-000000000002';
reset role;

select is(
  (select paper_title from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  'Rate-Assured Scheduling for GPU Inference',
  'on a flagged thesis week the presenter types the title; it is trimmed and control chars collapse');

select is(
  (select paper_link from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  NULL,
  'even on a thesis week paper_link stays server-controlled');

-- length cap
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.meetings set paper_title = repeat('x', 500)
where id = '11111111-0000-0000-0000-000000000002';
reset role;

select is(
  (select char_length(paper_title) from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  300,
  'an overlong thesis title is capped at 300 characters');

-- ═══ thesis weeks are anchored ══════════════════════════════════════════════
-- request.jwt.claims is transaction-local: `reset role` drops the ROLE but
-- leaves the claim, so auth.uid() keeps returning whoever was set last. Every
-- block below names its own actor rather than inheriting one. (The first draft
-- didn't, and a check meant to run as superuser quietly ran as the presenter —
-- it passed the guard's test instead of the CHECK's.)

-- A member never reaches the CHECK at all: the guard refuses the flip first.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.meetings set is_speaker = true
where id = '11111111-0000-0000-0000-000000000002';
reset role;

select is(
  (select is_speaker from public.meetings where id = '11111111-0000-0000-0000-000000000002'),
  false,
  'a presenter cannot flip a thesis week to a speaker week (guard, before any CHECK)');

-- With an admin the guard steps aside, and the CHECK is what refuses it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ update public.meetings set is_speaker = true
     where id = '11111111-0000-0000-0000-000000000002' $$,
  '23514', NULL, 'not even an admin can make a week both thesis and speaker (CHECK)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_claim('11111111-0000-0000-0000-000000000002') $$,
  'P0001', NULL, 'a thesis week cannot be claimed off the board');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_swap('11111111-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003') $$,
  'P0001', NULL, 'a thesis week cannot be swapped into someone else''s slot');
reset role;

select * from finish();
rollback;
