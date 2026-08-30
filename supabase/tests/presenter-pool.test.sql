-- meeting_presenter_pool regression suite — runs via `supabase test db`.
-- Same conventions as meetings-generate-semester.test.sql: seed as superuser
-- (bypasses RLS), impersonate by switching to `authenticated` + setting
-- request.jwt.claims (what is_meetings_admin reads), assert as superuser.
--
-- Dates are explicit literals in 2040 so they stay in the future relative to
-- current_date — meetings_fill_presenters deliberately ignores past weeks, and
-- a test seeded with today's date would start failing the day it was written.
-- One row is dated 2020 on purpose, to prove that filter fires.
--
-- Note on meetings_pool_compact: its only gate is the absent EXECUTE grant, so
-- there is no privilege assertion here — line 12's blanket grant would defeat
-- it. Its behaviour is covered indirectly, through the gap-closing assertions
-- on remove and cohort change.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(51);

-- ── actors ──────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'), -- admin
  ('bbbbbbbb-0000-0000-0000-000000000009'), -- ordinary non-admin
  ('bbbbbbbb-0000-0000-0000-000000000011'), -- A, cohort 113
  ('bbbbbbbb-0000-0000-0000-000000000012'), -- B, cohort 113
  ('bbbbbbbb-0000-0000-0000-000000000021'), -- C, cohort 114
  ('bbbbbbbb-0000-0000-0000-000000000022'), -- D, cohort 114
  ('bbbbbbbb-0000-0000-0000-000000000002'); -- existing presenter, never pooled

insert into public.user_profiles (id, email, name, roles) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@test.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000009', 'non@test.local', 'Non Admin', '{}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'a@test.local', 'A', '{}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'b@test.local', 'B', '{}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000021', 'c@test.local', 'C', '{}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000022', 'd@test.local', 'D', '{}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'p@test.local', 'P', '{}'::jsonb);

-- ═══ auth guards ════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000009","role":"authenticated"}', true);

select throws_ok(
  $$ select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', 113) $$,
  '42501', NULL, 'a non-admin cannot add to the presenter pool');
select throws_ok(
  $$ select public.meetings_pool_remove('bbbbbbbb-0000-0000-0000-000000000011') $$,
  '42501', NULL, 'a non-admin cannot remove from the presenter pool');
select throws_ok(
  $$ select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000011', 1) $$,
  '42501', NULL, 'a non-admin cannot reorder the presenter pool');
select throws_ok(
  $$ select public.meetings_fill_presenters(2040) $$,
  '42501', NULL, 'a non-admin cannot fill presenters');
reset role;

-- ═══ validation ═════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', 2024) $$,
  'P0001', '入學學年須為民國年三碼（例如 113）',
  'a 西元 year is rejected rather than silently stored');
select throws_ok(
  $$ select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', NULL) $$,
  'P0001', '入學學年須為民國年三碼（例如 113）', 'a null admission year is rejected');
select throws_ok(
  $$ select public.meetings_pool_upsert('cccccccc-0000-0000-0000-0000000000ff', 113) $$,
  'P0001', '找不到此使用者', 'an unknown user is rejected');
reset role;

-- ═══ ordering: append within a cohort ═══════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', 113);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000012', 113);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000021', 114);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000022', 114);
reset role;

select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000011'),
  1, 'the first member of a cohort takes position 1');
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000012'),
  2, 'the second member of a cohort is appended at position 2');
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000021'),
  1, 'positions restart at 1 in a different cohort');

-- the roster reads seniors-first, then position
select results_eq(
  $$ select name from public.meeting_presenter_roster $$,
  $$ values ('A'::text), ('B'), ('C'), ('D') $$,
  'the roster orders by admission year ascending, then position');

-- re-adding to the same cohort must not shuffle a deliberate order
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', 113);
reset role;
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000011'),
  1, 're-adding an existing member to the same cohort keeps their position');

-- ═══ reordering ═════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000011', 2) $$,
  'P0001', '一次只能移動一個位置', 'a multi-step move is rejected');
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000012', -1);
reset role;

select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000012'),
  1, 'moving up takes the position above');
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000011'),
  2, 'the displaced member takes the vacated position (a swap, not an insert)');

-- Down is its own branch: every other move assertion uses -1, so a sign error
-- here would pass the whole suite.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000012', 1);
reset role;

select is(
  (select string_agg(name, ',' order by sort_order)
   from public.meeting_presenter_roster where admission_year = 113),
  'A,B', 'moving down swaps with the member below');

-- put B back on top for the assertions that follow
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000012', -1);
reset role;

-- an edge move is a no-op, and never reaches into the neighbouring cohort
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000012', -1);
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000021', -1);
reset role;

select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000012'),
  1, 'moving up from the top of a cohort is a harmless no-op');
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000021'),
  1, 'moving up from the top of cohort 114 does not reach into cohort 113');
select is(
  (select admission_year from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000021'),
  114, 'an edge move never changes anyone''s cohort');

-- restore B/A to 1/2 → roster order is B, A, C, D from here on
select is(
  (select string_agg(name, ',' order by admission_year, sort_order) from public.meeting_presenter_roster),
  'B,A,C,D', 'the roster reflects the reordering');

-- ═══ cohort change compacts the vacated cohort ══════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000012', 115);
reset role;

select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000011'),
  1, 'the member left behind is renumbered to close the gap');
select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000012'),
  1, 'the mover is appended to the end of the new cohort');
select is(
  (select admission_year from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000012'),
  115, 'the mover carries their new admission year');

-- put B back in 113 so the fill test runs against A,B / C,D
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000012', 113);
reset role;

-- ═══ remove ═════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_remove('bbbbbbbb-0000-0000-0000-000000000002');
select public.meetings_pool_remove('bbbbbbbb-0000-0000-0000-000000000021');
reset role;

select is(
  (select sort_order from public.meeting_presenter_pool where user_id = 'bbbbbbbb-0000-0000-0000-000000000022'),
  1, 'removing the member above renumbers the survivor to position 1');
select is(
  (select count(*)::int from public.meeting_presenter_pool),
  3, 'removing a member who was never in the pool is a silent no-op');

-- restore C so the fill test has a full four-person roster: A,B / C,D
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000021', 114);
select public.meetings_pool_move('bbbbbbbb-0000-0000-0000-000000000021', -1);
reset role;

select is(
  (select string_agg(name, ',' order by admission_year, sort_order) from public.meeting_presenter_roster),
  'A,B,C,D', 'the roster is back to A,B,C,D before the fill test');

-- ═══ fill ═══════════════════════════════════════════════════════════════════
insert into public.meetings (year, week_label, scheduled_date, is_holiday, is_speaker, presenter, presenter_user_id) values
  (2040, '第1週', '2040-09-06', false, false, NULL, NULL),                                    -- → A
  (2040, '第2週(月考週)', '2040-09-13', true, false, NULL, NULL),                              -- holiday, skipped
  (2040, '第3週', '2040-09-20', false, false, NULL, NULL),                                    -- → B
  -- No presenter name on this one: with a name it would be skipped by the
  -- "already taken" filter even if the is_speaker clause were deleted, so the
  -- test would prove nothing about speaker weeks.
  (2040, '第4週', '2040-09-27', false, true, NULL, NULL),                                     -- speaker, skipped
  (2040, '第5週', '2040-10-04', false, false, NULL, NULL),                                    -- → C
  (2040, '第6週', '2040-10-11', false, false, 'P', 'bbbbbbbb-0000-0000-0000-000000000002'),   -- taken, skipped
  (2040, '第7週', '2040-10-18', false, false, '客座', NULL),                                   -- free-text, skipped
  (2040, '第8週', '2040-10-25', false, false, NULL, NULL),                                    -- → D
  (2040, '第9週', '2040-11-01', false, false, NULL, NULL),                                    -- → A (wraps)
  (2040, '第0週', '2020-01-01', false, false, NULL, NULL);                                    -- past, skipped

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table fill_first as
  select public.meetings_fill_presenters(2040) as ret;
reset role;

select is((select (ret->>'filled')::int from fill_first), 5, 'fill reports the 5 eligible weeks it assigned');
select is((select (ret->>'poolSize')::int from fill_first), 4, 'fill reports the roster size it cycled through');

-- The five eligible dates, named explicitly: filtering on "has a presenter"
-- would also pick up 第6週, which was seeded with one and correctly skipped.
select is(
  (select string_agg(presenter, ',' order by scheduled_date)
   from public.meetings
   where scheduled_date in
     ('2040-09-06', '2040-09-20', '2040-10-04', '2040-10-25', '2040-11-01')),
  'A,B,C,D,A',
  'weeks are filled in roster order, wrapping back to the top when it runs out');

select is(
  (select presenter from public.meetings where scheduled_date = '2040-09-13'),
  NULL, 'a holiday week is never assigned a presenter');
select is(
  (select presenter_user_id from public.meetings where scheduled_date = '2040-09-27'),
  NULL, 'a speaker week is never assigned a presenter');
select is(
  (select presenter from public.meetings where scheduled_date = '2040-09-27'),
  NULL, 'a speaker week is skipped for being a speaker week, not for being taken');
select is(
  (select presenter from public.meetings where scheduled_date = '2040-10-11'),
  'P', 'a week that already has a presenter is left alone');
select is(
  (select presenter from public.meetings where scheduled_date = '2040-10-18'),
  '客座', 'a week carrying only a free-text presenter counts as taken');
select is(
  (select presenter from public.meetings where scheduled_date = '2020-01-01'),
  NULL, 'a past week is never filled — that would invent a presentation');

-- re-running has nothing left to do
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table fill_again as
  select public.meetings_fill_presenters(2040) as ret;
reset role;

select is((select (ret->>'filled')::int from fill_again), 0, 're-running the fill assigns nothing (idempotent)');

-- an empty roster is reported, not an error
delete from public.meeting_presenter_pool;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table fill_empty as
  select public.meetings_fill_presenters(2041) as ret;
reset role;

select is((select (ret->>'filled')::int from fill_empty), 0, 'an empty roster fills nothing');
select is((select (ret->>'poolSize')::int from fill_empty), 0, 'an empty roster reports poolSize 0 rather than failing');

-- ═══ a week whose paper the only candidate already presented ════════════════
-- meetings_presenter_paper_uniq is a partial index and cannot be deferred, so
-- this raises inside the loop. Without the handler the exception would abort
-- the whole fill; the week must simply be left alone instead. Dates are five
-- years apart so meetings_paper_cooldown (365 days per paper) stays satisfied.
insert into public.teacher_papers (id, provided_date, paper_name) values
  ('dddddddd-0000-0000-0000-000000000001', '2035-01-01', 'A paper A already gave');

insert into public.meetings (year, week_label, scheduled_date, presenter, presenter_user_id, teacher_paper_id) values
  (2035, '第1週', '2035-01-01', 'A', 'bbbbbbbb-0000-0000-0000-000000000011',
   'dddddddd-0000-0000-0000-000000000001');

insert into public.meetings (year, week_label, scheduled_date, teacher_paper_id) values
  (2043, '第1週', '2043-09-07', 'dddddddd-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('bbbbbbbb-0000-0000-0000-000000000011', 113);
create temp table fill_clash as
  select public.meetings_fill_presenters(2043) as ret;
reset role;

select is((select (ret->>'filled')::int from fill_clash), 0,
  'a week the only candidate cannot take is skipped, not fatal');
select is(
  (select presenter_user_id from public.meetings where scheduled_date = '2043-09-07'),
  NULL, 'that week is left unassigned rather than rolling the whole fill back');
select is(
  (select presenter from public.meetings where scheduled_date = '2035-01-01'),
  'A', 'the earlier presentation of that paper is untouched');

-- ── tier ordering: 學制優先於入學年 ──────────────────────────────────────────
-- 一位入學年「較晚」的博士生，必須排在所有碩士之前。這正是舊排序
-- (admission_year, sort_order) 排不出來的情況 —— 現行資料排對純屬巧合，
-- 因為唯一的博士生剛好入學年最早。
insert into auth.users (id) values
  ('d0000000-0000-0000-0000-000000000001'),  -- 博士，民國 115（較晚）
  ('d0000000-0000-0000-0000-000000000002'),  -- 碩士，民國 113（較早）
  ('d0000000-0000-0000-0000-000000000003');  -- 大學部，民國 114

insert into public.user_profiles (id, email, name, lab_status) values
  ('d0000000-0000-0000-0000-000000000001', 'd1@test.local', 'Doc Late',   'doctoral'),
  ('d0000000-0000-0000-0000-000000000002', 'd2@test.local', 'Master Early','master'),
  ('d0000000-0000-0000-0000-000000000003', 'd3@test.local', 'Undergrad',  'undergrad');

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order) values
  ('d0000000-0000-0000-0000-000000000001', 115, 1),
  ('d0000000-0000-0000-0000-000000000002', 113, 2),
  ('d0000000-0000-0000-0000-000000000003', 114, 2);

select is(
  public.meetings_tier_rank('doctoral'), 0,
  'meetings_tier_rank: doctoral is 0'
);

select is(
  public.meetings_tier_rank(null), 3,
  'meetings_tier_rank: NULL falls to the trailing bucket'
);

select is(
  (select array_agg(name order by tier_rank asc, admission_year asc, sort_order asc, user_id asc)
   from public.meeting_presenter_roster
   where user_id in ('d0000000-0000-0000-0000-000000000001',
                     'd0000000-0000-0000-0000-000000000002',
                     'd0000000-0000-0000-0000-000000000003')),
  array['Doc Late', 'Master Early', 'Undergrad'],
  'roster tier order puts a LATER-admitted doctoral student ahead of an EARLIER-admitted master'
);

select is(
  (select lab_status from public.meeting_presenter_roster
   where user_id = 'd0000000-0000-0000-0000-000000000001'),
  'doctoral',
  'roster exposes lab_status'
);

delete from public.meeting_presenter_pool
  where user_id in ('d0000000-0000-0000-0000-000000000001',
                    'd0000000-0000-0000-0000-000000000002',
                    'd0000000-0000-0000-0000-000000000003');

-- ── fill_presenters 也要吃 tier 順序 ────────────────────────────────────────
-- 兩個空白週 + 兩位候選人：博士(民國115，入學較晚) 與 碩士(民國113，入學較早)。
-- 舊排序會讓碩士先拿到第一週；新排序必須讓博士先拿到。
-- Note: (113, 1) is already taken at this point by bbbbbbbb-...-011 (see the
-- `meetings_pool_upsert` restore two blocks up, after the pool was emptied at
-- line 276) — the master candidate here uses (113, 2) instead. The brief's
-- literal sort_order for the master collides with that leftover row; the
-- admission years (115 later, 113 earlier) are what the assertion needs and
-- are kept exactly as specified.
insert into auth.users (id) values
  ('d0000000-0000-0000-0000-000000000011'),  -- 管理員
  ('d0000000-0000-0000-0000-000000000012'),  -- 博士，民國 115
  ('d0000000-0000-0000-0000-000000000013');  -- 碩士，民國 113

insert into public.user_profiles (id, email, name, roles, lab_status) values
  ('d0000000-0000-0000-0000-000000000011', 'dadmin@test.local', 'D Admin', '{"meetings":["admin"]}'::jsonb, 'master'),
  ('d0000000-0000-0000-0000-000000000012', 'd12@test.local', 'Fill Doc',    '{}'::jsonb, 'doctoral'),
  ('d0000000-0000-0000-0000-000000000013', 'd13@test.local', 'Fill Master', '{}'::jsonb, 'master');

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order) values
  ('d0000000-0000-0000-0000-000000000012', 115, 1),
  ('d0000000-0000-0000-0000-000000000013', 113, 2);

-- 未來日期寫死，避免測試隨時鐘飄移。fill 只碰 scheduled_date >= 今天(台北)。
insert into public.meetings (id, year, week_label, scheduled_date, is_holiday, is_speaker)
values
  ('d0000000-0000-0000-0000-0000000000a1', 2099, 'T2 第1週', '2099-03-02', false, false),
  ('d0000000-0000-0000-0000-0000000000a2', 2099, 'T2 第2週', '2099-03-09', false, false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000011"}', true);

select public.meetings_fill_presenters(2099);

reset role;

select is(
  (select presenter from public.meetings
   where id = 'd0000000-0000-0000-0000-0000000000a1'),
  'Fill Doc',
  'fill_presenters walks the roster in tier order: the later-admitted doctoral student takes the first week'
);

delete from public.meetings where year = 2099;
delete from public.meeting_presenter_pool
  where user_id in ('d0000000-0000-0000-0000-000000000012',
                    'd0000000-0000-0000-0000-000000000013');

-- ── move 只在同一層內找鄰居 ─────────────────────────────────────────────────
-- 同一個入學年裡放一位博士與兩位碩士。博士是他那一層的唯一成員，所以往上移
-- 應該是 no-op；碩士的順序不能被他動到。
insert into auth.users (id) values
  ('d0000000-0000-0000-0000-000000000021'),  -- 管理員
  ('d0000000-0000-0000-0000-000000000022'),  -- 博士，民國 116
  ('d0000000-0000-0000-0000-000000000023'),  -- 碩士，民國 116
  ('d0000000-0000-0000-0000-000000000024');  -- 碩士，民國 116

insert into public.user_profiles (id, email, name, roles, lab_status) values
  ('d0000000-0000-0000-0000-000000000021', 'madmin@test.local', 'M Admin', '{"meetings":["admin"]}'::jsonb, 'master'),
  ('d0000000-0000-0000-0000-000000000022', 'm22@test.local', 'Mixed Doc', '{}'::jsonb, 'doctoral'),
  ('d0000000-0000-0000-0000-000000000023', 'm23@test.local', 'Mixed M1',  '{}'::jsonb, 'master'),
  ('d0000000-0000-0000-0000-000000000024', 'm24@test.local', 'Mixed M2',  '{}'::jsonb, 'master');

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order) values
  ('d0000000-0000-0000-0000-000000000023', 116, 1),
  ('d0000000-0000-0000-0000-000000000024', 116, 2),
  ('d0000000-0000-0000-0000-000000000022', 116, 3);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000021","role":"authenticated"}', true);

-- 博士生往上移：他那一層只有他，應該什麼都不做。
select public.meetings_pool_move('d0000000-0000-0000-0000-000000000022', -1);

reset role;

select is(
  (select sort_order from public.meeting_presenter_pool
   where user_id = 'd0000000-0000-0000-0000-000000000024'),
  2,
  'moving the only member of a tier does not shuffle a member of another tier'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000021","role":"authenticated"}', true);

-- 碩士之間的搬移照舊有效。
select public.meetings_pool_move('d0000000-0000-0000-0000-000000000024', -1);

reset role;

select is(
  (select sort_order from public.meeting_presenter_pool
   where user_id = 'd0000000-0000-0000-0000-000000000024'),
  1,
  'moving within a tier still swaps with the adjacent same-tier member'
);

delete from public.meeting_presenter_pool where admission_year = 116;

-- ── move skips past an intervening different-tier member to the NEAREST
--    same-tier neighbour, not merely one that happens to sit at ± 1 ────────
-- Tiers interleaved by sort_order within one intake year: doctoral@1,
-- master@2, doctoral@3, master@4. Moving doctoral@3 up must land it at
-- position 1 (trading with doctoral@1), skipping straight over master@2 —
-- not a no-op, and not a swap with master@2. An implementation that simply
-- ANDs a tier check onto the OLD `sort_order = current + p_delta` predicate
-- would look for a same-tier row at sort_order = 2, find none (it's a
-- master), and wrongly no-op: mover stays at 3, target stays at 1, and the
-- intervening master's position would be the only thing "consistent" with
-- both a correct and a naive implementation — which is why it is asserted
-- unchanged rather than used to distinguish them.
insert into auth.users (id) values
  ('f0000000-0000-0000-0000-000000000001'),  -- 管理員
  ('f0000000-0000-0000-0000-000000000002'),  -- 博士，民國 118 (target)
  ('f0000000-0000-0000-0000-000000000003'),  -- 碩士，民國 118 (intervening)
  ('f0000000-0000-0000-0000-000000000004'),  -- 博士，民國 118 (mover)
  ('f0000000-0000-0000-0000-000000000005');  -- 碩士，民國 118

insert into public.user_profiles (id, email, name, roles, lab_status) values
  ('f0000000-0000-0000-0000-000000000001', 'fadmin@test.local', 'F Admin', '{"meetings":["admin"]}'::jsonb, 'master'),
  ('f0000000-0000-0000-0000-000000000002', 'f2@test.local', 'Interleave Doc A', '{}'::jsonb, 'doctoral'),
  ('f0000000-0000-0000-0000-000000000003', 'f3@test.local', 'Interleave M1',    '{}'::jsonb, 'master'),
  ('f0000000-0000-0000-0000-000000000004', 'f4@test.local', 'Interleave Doc B', '{}'::jsonb, 'doctoral'),
  ('f0000000-0000-0000-0000-000000000005', 'f5@test.local', 'Interleave M2',    '{}'::jsonb, 'master');

insert into public.meeting_presenter_pool (user_id, admission_year, sort_order) values
  ('f0000000-0000-0000-0000-000000000002', 118, 1),
  ('f0000000-0000-0000-0000-000000000003', 118, 2),
  ('f0000000-0000-0000-0000-000000000004', 118, 3),
  ('f0000000-0000-0000-0000-000000000005', 118, 4);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- doctoral@3 往上移：他那一層在該方向唯一的候選是 doctoral@1，中間隔著一位碩士。
select public.meetings_pool_move('f0000000-0000-0000-0000-000000000004', -1);

reset role;

select is(
  (select sort_order from public.meeting_presenter_pool
   where user_id = 'f0000000-0000-0000-0000-000000000004'),
  1,
  'the mover reaches the nearest same-tier neighbour, skipping the intervening tier'
);

select is(
  (select sort_order from public.meeting_presenter_pool
   where user_id = 'f0000000-0000-0000-0000-000000000002'),
  3,
  'the same-tier target takes the mover''s old position, not merely vacates its own'
);

select is(
  (select sort_order from public.meeting_presenter_pool
   where user_id = 'f0000000-0000-0000-0000-000000000003'),
  2,
  'the intervening different-tier member sitting between them is left untouched'
);

delete from public.meeting_presenter_pool where admission_year = 118;

select * from finish();
rollback;
