-- Questioner roster + reconcile-on-commit regression suite (#1173) — runs via
-- `supabase test db`. Replaces questioner-rotation.test.sql, which exercised
-- meetings_sync_questioners and the old full rebalance on past-dated weeks;
-- neither exists in that form any more (see 20260918104130's header).
--
-- Conventions as in the rest of the meetings suites: seed as superuser, act as
-- `authenticated` with request.jwt.claims set, assert as superuser after
-- `reset role`. Two things are specific to this file:
--
-- * Dates are RELATIVE to today in Asia/Taipei (pg_temp.w(n) = today + 7n).
--   The reconcile only ever writes weeks after today, so fixed literals would
--   silently turn into untouchable history as the calendar moves.
--
-- * The reconcile runs from a DEFERRED constraint trigger, i.e. at COMMIT, and
--   this file rolls back. pg_temp.settle() fires it exactly where a commit
--   would have, by flipping the constraint to IMMEDIATE and back — so every
--   assertion after a settle() sees what production sees after the request.
--   Using `set constraints … immediate` for the whole file instead would run
--   it at the end of every nested statement, mid-way through multi-row
--   operations like insert_week, which production never does.
--
-- The scenarios form one story over one global roster, because the reconcile
-- is global: every settle() reconciles every future week. Each step asserts
-- what that step is for, plus the invariant that holds after every step — no
-- two rotation members more than one seat apart relative to their fair share
-- (pg_temp.spread() <= 1).

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns must be callable after we drop to the authenticated role.
grant execute on all functions in schema public to authenticated;

select plan(108);

-- ── helpers ────────────────────────────────────────────────────────────────

create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

create function pg_temp.w(n int) returns date language sql stable as $$
  select pg_temp.today() + 7 * n
$$;

create function pg_temp.settle() returns void language plpgsql as $$
begin
  set constraints public.meetings_reconcile_fire immediate;
  set constraints public.meetings_reconcile_fire deferred;
end;
$$;

-- Future seats a member holds.
create function pg_temp.held(p_user uuid) returns int language sql stable as $$
  select count(*)::int
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  where mq.user_id = p_user and m.scheduled_date > pg_temp.today()
$$;

-- max(held − ideal) − min(held − ideal) over rotation members, as the
-- reconcile itself judges it (dry run: reads, writes nothing).
create function pg_temp.spread() returns numeric language sql as $$
  select case when count(*) = 0 then null else max(d) - min(d) end
  from (
    select (m->>'held')::numeric - (m->>'ideal')::numeric as d
    from jsonb_array_elements(
           public.meetings_reconcile_questioners(false, true)->'members') m
  ) t
$$;

-- Future weeks left short of three while an eligible member sits idle.
create function pg_temp.understaffed() returns int language sql stable as $$
  select count(*)::int
  from public.meetings m
  where m.scheduled_date > pg_temp.today()
    and public.meetings_week_takes_questioners(m.is_holiday, m.is_speaker, m.presenter_user_id)
    and (select count(*) from public.meeting_questioners q where q.meeting_id = m.id) < 3
    and exists (
      select 1 from public.meeting_question_pool p
      where public.meetings_questioner_can_serve(
              p.user_id, m.id, m.scheduled_date, m.presenter_user_id, true)
        and not exists (select 1 from public.meeting_questioners q
                         where q.meeting_id = m.id and q.user_id = p.user_id))
$$;

create function pg_temp.pending() returns int language sql stable as $$
  select count(*)::int from public.meetings_reconcile_pending
$$;

-- ── actors ─────────────────────────────────────────────────────────────────
-- e0… admin / non-admin, e1… roster members, e2… presenters outside the
-- roster, e3… the roster-management scenario.

insert into auth.users (id) values
  ('e0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000003'),
  ('e1000000-0000-0000-0000-000000000004'),
  ('e1000000-0000-0000-0000-000000000005'),
  ('e1000000-0000-0000-0000-000000000006'),
  ('e1000000-0000-0000-0000-000000000007'),
  ('e2000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002'),
  ('e2000000-0000-0000-0000-000000000003'),
  ('e2000000-0000-0000-0000-000000000004'),
  ('e2000000-0000-0000-0000-000000000005'),
  ('e2000000-0000-0000-0000-000000000006'),
  ('e2000000-0000-0000-0000-000000000009'),
  ('e3000000-0000-0000-0000-000000000001'),
  ('e3000000-0000-0000-0000-000000000002'),
  ('e3000000-0000-0000-0000-000000000003');

insert into public.user_profiles (id, email, name, roles) values
  ('e0000000-0000-0000-0000-000000000001', 'admin@t.local', 'Admin', '{"meetings":["admin"]}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'non@t.local', 'NonAdmin', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000001', 'r1@t.local', 'R1', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000002', 'r2@t.local', 'R2', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000003', 'r3@t.local', 'R3', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000004', 'r4@t.local', 'R4', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000005', 'r5@t.local', 'R5', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000006', 'r6@t.local', 'R6', '{}'::jsonb),
  ('e1000000-0000-0000-0000-000000000007', 'r7@t.local', 'R7', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000001', 'x1@t.local', 'X1', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000002', 'x2@t.local', 'X2', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000003', 'x3@t.local', 'X3', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000004', 'x4@t.local', 'X4', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000005', 'x5@t.local', 'X5', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000006', 'x6@t.local', 'X6', '{}'::jsonb),
  ('e2000000-0000-0000-0000-000000000009', 'claimer@t.local', 'Claimer', '{}'::jsonb),
  ('e3000000-0000-0000-0000-000000000001', 'p1@t.local', 'P1', '{}'::jsonb),
  ('e3000000-0000-0000-0000-000000000002', 'e1@t.local', 'E1', '{}'::jsonb),
  ('e3000000-0000-0000-0000-000000000003', 'al@t.local', 'Alumnus', '{}'::jsonb);

-- As superuser with no JWT: prevent_role_escalation only lets lab_status
-- through when auth.uid() is null.
update public.user_profiles set lab_status = 'master' where lab_status is null;
update public.user_profiles set lab_status = 'alumni'
where id = 'e3000000-0000-0000-0000-000000000003';

-- ═══ A. the roster ═════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.meetings_pool_upsert('e3000000-0000-0000-0000-000000000001', 114) $$,
  'an admin adds a member to the presenter roster'
);
select lives_ok(
  $$ select public.meetings_question_pool_add('e3000000-0000-0000-0000-000000000002') $$,
  'an admin adds an extra questioner'
);
select throws_ok(
  $$ select public.meetings_question_pool_add('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', '此成員在報告順位名單中，已是預設提問人',
  'a presenter cannot also be added as an extra questioner'
);
select throws_ok(
  $$ select public.meetings_question_pool_remove('e3000000-0000-0000-0000-000000000001') $$,
  'P0001', '預設提問人無法移除，請改用停用',
  'a default questioner is switched off, not removed'
);
select throws_ok(
  $$ select public.meetings_question_pool_add('e3000000-0000-0000-0000-000000000003') $$,
  'P0001', '提問輪替只包含碩士生與博士生',
  'someone outside the rotation cannot be added'
);

select results_eq(
  $$ select user_id, is_presenter, is_enabled from public.meeting_question_rotation
     where user_id in ('e3000000-0000-0000-0000-000000000001',
                       'e3000000-0000-0000-0000-000000000002')
     order by user_id $$,
  $$ values ('e3000000-0000-0000-0000-000000000001'::uuid, true, true),
            ('e3000000-0000-0000-0000-000000000002'::uuid, false, true) $$,
  'the rotation lists both, telling the presenter from the extra member'
);
select results_eq(
  $$ select user_id from public.meeting_question_pool_members
     where user_id::text like 'e3%' order by user_id $$,
  $$ values ('e3000000-0000-0000-0000-000000000002'::uuid) $$,
  'the extras view lists only the member who is not a presenter'
);
reset role;

select is(
  (select joined_on from public.meeting_question_pool
    where user_id = 'e3000000-0000-0000-0000-000000000001'),
  pg_temp.today(),
  'joining the presenter roster starts the questioner clock today'
);

-- non-admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_question_pool_add('e3000000-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'a non-admin cannot add a questioner');
select throws_ok(
  $$ select public.meetings_question_pool_remove('e3000000-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'a non-admin cannot remove a questioner');
select throws_ok(
  $$ select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', false) $$,
  '42501', NULL, 'a non-admin cannot switch a questioner off');
select throws_ok(
  $$ insert into public.meeting_question_pool_pauses (user_id, paused_on)
     values ('e3000000-0000-0000-0000-000000000001', current_date) $$,
  '42501', NULL, 'nobody writes the pause table directly');
select throws_ok(
  $$ insert into public.meeting_questioner_exclusions (meeting_id, user_id)
     values (gen_random_uuid(), 'e3000000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'nobody writes the exclusion table directly');
select lives_ok(
  $$ select * from public.meeting_question_rotation $$,
  'a signed-in member can read the rotation');
reset role;

-- pauses
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', false);
select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', false);
select is(
  (select is_enabled from public.meeting_question_rotation
    where user_id = 'e3000000-0000-0000-0000-000000000001'),
  false,
  'a paused member reads as switched off, through RLS'
);
reset role;

select results_eq(
  $$ select paused_on, resumed_on from public.meeting_question_pool_pauses
     where user_id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values (pg_temp.today() + 1, null::date) $$,
  'switching off twice opens one pause, starting tomorrow'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', true);
reset role;

select is(
  (select count(*)::int from public.meeting_question_pool_pauses
    where user_id = 'e3000000-0000-0000-0000-000000000001'),
  0,
  'switched off and back on before it took effect leaves no trace'
);

-- A pause that has been in force for a week, then resumed and re-paused today.
insert into public.meeting_question_pool_pauses (user_id, paused_on)
values ('e3000000-0000-0000-0000-000000000001', pg_temp.today() - 7);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', true);
reset role;

select results_eq(
  $$ select paused_on, resumed_on from public.meeting_question_pool_pauses
     where user_id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values (pg_temp.today() - 7, pg_temp.today() + 1) $$,
  'resuming closes the pause from tomorrow and keeps its history'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e3000000-0000-0000-0000-000000000001', false);
reset role;

select results_eq(
  $$ select paused_on, resumed_on from public.meeting_question_pool_pauses
     where user_id = 'e3000000-0000-0000-0000-000000000001' $$,
  $$ values (pg_temp.today() - 7, null::date) $$,
  'switching off again the same day reopens that pause instead of leaving a one-day gap'
);

-- promotion and departure
update public.meeting_question_pool set joined_on = pg_temp.today() - 30
where user_id = 'e3000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_upsert('e3000000-0000-0000-0000-000000000002', 114);
reset role;

select is(
  (select joined_on from public.meeting_question_pool
    where user_id = 'e3000000-0000-0000-0000-000000000002'),
  pg_temp.today() - 30,
  'an extra member who becomes a presenter keeps their clock'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_pool_remove('e3000000-0000-0000-0000-000000000001');
select public.meetings_pool_remove('e3000000-0000-0000-0000-000000000002');
reset role;

select is(
  (select count(*)::int from public.meeting_question_pool where user_id::text like 'e3%'),
  0,
  'leaving the presenter roster ends one''s questioning too'
);
select is(
  (select count(*)::int from public.meeting_question_pool_pauses where user_id::text like 'e3%'),
  0,
  'and takes the pause history with it'
);

-- Expand-phase shims: the deployed frontend still calls these by name.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_remove_from_pool('e3000000-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'the old remove RPC is still admin-only');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_add('e3000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ select public.meetings_remove_from_pool('e3000000-0000-0000-0000-000000000002') $$,
  'the old remove RPC forwards to the new one');
select lives_ok(
  $$ select public.meetings_sync_questioners(gen_random_uuid()) $$,
  'the old sync RPC is accepted and does nothing');
reset role;

select is(
  (select count(*)::int from public.meeting_question_pool
    where user_id = 'e3000000-0000-0000-0000-000000000002'),
  0,
  'and the forwarded remove took the extra member off'
);
select has_column('public', 'meeting_question_rotation', 'pool_added_at',
  'the rotation keeps pool_added_at for the deployed panel''s ordering');
select bag_eq(
  $$ select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'meeting_question_pool_members' $$,
  $$ values ('user_id'), ('name'), ('email'), ('pool_added_at'), ('last_asked_date'),
            ('times_asked'), ('is_active'), ('times_asked_scheduled'),
            ('opportunities'), ('rate') $$,
  'the extras view keeps exactly the columns the deployed panel reads'
);

-- ═══ B. the reconcile ══════════════════════════════════════════════════════
-- Six members who joined long ago; five future weeks presented by people
-- outside the roster; one past and one same-day week that must never be
-- written.

select set_config('request.jwt.claims', '', true);

insert into public.meeting_question_pool (user_id, joined_on)
select id, pg_temp.today() - 100
from public.user_profiles
where id::text like 'e1000000-%' and id <> 'e1000000-0000-0000-0000-000000000007';

insert into public.meetings (id, week_label, scheduled_date, presenter, presenter_user_id) values
  ('f0000000-0000-0000-0000-000000000001', 'W1', pg_temp.w(1), 'X1', 'e2000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'W2', pg_temp.w(2), 'X2', 'e2000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000003', 'W3', pg_temp.w(3), 'X3', 'e2000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000004', 'W4', pg_temp.w(4), 'X4', 'e2000000-0000-0000-0000-000000000004'),
  ('f0000000-0000-0000-0000-000000000005', 'W5', pg_temp.w(5), 'X5', 'e2000000-0000-0000-0000-000000000005'),
  ('f0000000-0000-0000-0000-00000000000a', 'PAST', pg_temp.today() - 14, 'X6', 'e2000000-0000-0000-0000-000000000006'),
  ('f0000000-0000-0000-0000-00000000000b', 'TODAY', pg_temp.today(), 'X6', 'e2000000-0000-0000-0000-000000000006');

-- Two weeks nearer than W1 that carry no roster: the freeze line must skip them.
insert into public.meetings (id, week_label, scheduled_date, is_speaker, presenter) values
  ('f1000000-0000-0000-0000-000000000001', 'TALK', pg_temp.today() + 3, true, 'Guest');
insert into public.meetings (id, week_label, scheduled_date) values
  ('f1000000-0000-0000-0000-000000000002', 'OPEN', pg_temp.today() + 4);

select cmp_ok(pg_temp.pending(), '=', 1, 'any number of edits in one transaction queue one reconcile');
select pg_temp.settle();
select is(pg_temp.pending(), 0, 'the reconcile consumes its queue entry');

select is(
  (select array_agg(n order by d)
     from (select m.scheduled_date as d, count(mq.user_id)::int as n
             from public.meetings m
             left join public.meeting_questioners mq on mq.meeting_id = m.id
            where m.id::text like 'f0000000-0000-0000-0000-00000000000%'
              and m.id::text not like '%a' and m.id::text not like '%b'
            group by m.scheduled_date) t),
  array[3, 3, 3, 3, 3],
  'every future week gets three questioners'
);
select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id in ('f0000000-0000-0000-0000-00000000000a',
                         'f0000000-0000-0000-0000-00000000000b')),
  0,
  'a past week and today''s week are never staffed'
);
select ok(
  (select bool_and(pg_temp.held(user_id) between 2 and 3)
     from public.meeting_question_pool where user_id::text like 'e1%'),
  'fifteen seats among six members: everyone holds two or three'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'nobody is more than one seat apart from anyone else');
select is(pg_temp.understaffed(), 0, 'no week is left short while someone could take the seat');
select is(
  (public.meetings_reconcile_questioners(false, true)->>'frozenDate')::date,
  pg_temp.w(1),
  'the freeze line skips a speaker week and a week without a presenter'
);
select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id in ('f1000000-0000-0000-0000-000000000001',
                         'f1000000-0000-0000-0000-000000000002')),
  0,
  'and neither of those weeks is staffed'
);
select ok(
  not exists (
    select 1 from public.meeting_questioners mq
    join public.meetings m on m.id = mq.meeting_id
    where mq.user_id = m.presenter_user_id),
  'nobody asks at their own presentation'
);

select results_eq(
  $$ select (r->>'added')::int, (r->>'removed')::int, (r->>'moves')::int
       from (select public.meetings_reconcile_questioners(false, true) as r) t $$,
  $$ values (0, 0, 0) $$,
  'a second reconcile over the same state changes nothing'
);

update public.meetings set notes = 'slides later'
where id = 'f0000000-0000-0000-0000-000000000002';
select is(pg_temp.pending(), 0, 'editing notes does not queue a reconcile');

-- ── B1. a week is deleted outright ─────────────────────────────────────────

create temp table b1_before as
  select meeting_id, user_id, assigned_at from public.meeting_questioners
  where meeting_id in (select id from public.meetings where scheduled_date > pg_temp.today());
create temp table b1_counts as
  select user_id, count(*)::int as n from b1_before group by user_id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
delete from public.meetings where id = 'f0000000-0000-0000-0000-000000000003';
reset role;
select set_config('request.jwt.claims', '', true);

create temp table b1_plan as
  select public.meetings_reconcile_questioners(false, true) as r;
select pg_temp.settle();

select ok(
  (select bool_and(pg_temp.held(user_id) = 2)
     from public.meeting_question_pool where user_id::text like 'e1%'),
  'twelve seats among six: the three who lost a seat are paid back, everyone holds two'
);

-- Every seat that changed hands outside W3 is one the repair reports moving,
-- and it had to move at least one per member left holding three (more only
-- when a transfer needs a chain through a third member).
select is(
  (select count(*)::int from b1_before b
    where b.meeting_id <> 'f0000000-0000-0000-0000-000000000003'
      and not exists (select 1 from public.meeting_questioners q
                       where q.meeting_id = b.meeting_id and q.user_id = b.user_id)),
  (select (r->>'moves')::int from b1_plan),
  'nothing moves except what the repair reports'
);
select cmp_ok(
  (select (r->>'moves')::int from b1_plan),
  '>=',
  (select count(*)::int from b1_counts c
    where c.n = 3
      and not exists (select 1 from b1_before b
                       where b.meeting_id = 'f0000000-0000-0000-0000-000000000003'
                         and b.user_id = c.user_id)),
  'and at least one seat per member left over-served'
);
select results_eq(
  $$ select user_id, assigned_at from public.meeting_questioners
     where meeting_id = 'f0000000-0000-0000-0000-000000000001' order by user_id $$,
  $$ select user_id, assigned_at from b1_before
     where meeting_id = 'f0000000-0000-0000-0000-000000000001' order by user_id $$,
  'the nearest week keeps its roster, assigned_at and all'
);

-- ── B2. a questioner becomes that week's presenter ────────────────────────

create temp table b2 as
  select user_id from public.meeting_questioners
  where meeting_id = 'f0000000-0000-0000-0000-000000000002'
  order by user_id limit 1;
grant select on b2 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.meetings
set presenter = 'Q', presenter_user_id = (select user_id from b2)
where id = 'f0000000-0000-0000-0000-000000000002';
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not exists (select 1 from public.meeting_questioners
               where meeting_id = 'f0000000-0000-0000-0000-000000000002'
                 and user_id = (select user_id from b2)),
  'the new presenter leaves that week''s questioners at once, before any reconcile'
);
select pg_temp.settle();
select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-000000000002'),
  3,
  'and the week is refilled at commit'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat after a presenter change');

-- ── B3. a week becomes a holiday ──────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.meetings set is_holiday = true
where id = 'f0000000-0000-0000-0000-000000000004';
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-000000000004'),
  0,
  'a week flagged as a holiday loses its questioners'
);
select is(
  (select count(*)::int from public.meeting_questioners mq
    join public.meetings m on m.id = mq.meeting_id
   where m.scheduled_date > pg_temp.today()),
  9,
  'three weeks left, nine seats'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat after a holiday');

-- ── B4. one member graduates, another loses their Keycloak classification ─

create temp table b4_r3 as
  select meeting_id from public.meeting_questioners
  where user_id = 'e1000000-0000-0000-0000-000000000003';

update public.user_profiles set lab_status = 'alumni'
where id = 'e1000000-0000-0000-0000-000000000002';
update public.user_profiles set lab_status = null
where id = 'e1000000-0000-0000-0000-000000000003';

select is(pg_temp.pending(), 1, 'a roster member''s lab_status change queues a reconcile');
select pg_temp.settle();

select is(pg_temp.held('e1000000-0000-0000-0000-000000000002'), 0,
  'a graduate is taken off every future week');
select results_eq(
  $$ select meeting_id from public.meeting_questioners
     where user_id = 'e1000000-0000-0000-0000-000000000003' order by 1 $$,
  $$ select meeting_id from b4_r3 order by 1 $$,
  'an unclassified member keeps exactly the seats they held — no eviction, no new ones'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat after a graduation');
select is(
  public.meetings_questioner_can_serve('e1000000-0000-0000-0000-000000000003',
    'f0000000-0000-0000-0000-000000000001', pg_temp.w(1),
    'e2000000-0000-0000-0000-000000000001', true),
  false,
  'an unclassified member is never newly placed'
);
select is(
  public.meetings_questioner_can_serve('e1000000-0000-0000-0000-000000000003',
    'f0000000-0000-0000-0000-000000000001', pg_temp.w(1),
    'e2000000-0000-0000-0000-000000000001', false),
  true,
  'but may keep a seat, or be placed by hand'
);

update public.user_profiles set lab_status = 'alumni'
where id = 'e2000000-0000-0000-0000-000000000006';
select is(pg_temp.pending(), 0, 'a lab_status change of someone off the roster queues nothing');

update public.user_profiles set lab_status = 'master'
where id = 'e1000000-0000-0000-0000-000000000003';
select pg_temp.settle();

-- ── B5. a member is switched off, then back on ────────────────────────────

create temp table b5_opp as
  select opportunities from public.meeting_question_rotation
  where user_id = 'e1000000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000004', false);
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select is(pg_temp.held('e1000000-0000-0000-0000-000000000004'), 0,
  'a switched-off member leaves every future week, the nearest one included');
select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-000000000001'),
  3,
  'and the nearest week is refilled rather than left short'
);
select ok(
  (select opportunities from b5_opp) > 0
  and (select opportunities from public.meeting_question_rotation
        where user_id = 'e1000000-0000-0000-0000-000000000004') = 0,
  'every paused week stops counting as an opportunity they missed'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat while someone is paused');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000004', true);
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select cmp_ok(pg_temp.held('e1000000-0000-0000-0000-000000000004'), '>=', 1,
  'switched back on, they are given seats again');
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'and the roster is back within one seat');

-- ── B6. manual replacement and the exclusion it leaves ────────────────────

create temp table b6 as
  select
    (select user_id from public.meeting_questioners
      where meeting_id = 'f0000000-0000-0000-0000-000000000005'
      order by user_id limit 1) as x,
    (select q.user_id from public.meeting_question_pool q
      where q.user_id::text like 'e1%'
        and q.user_id <> 'e1000000-0000-0000-0000-000000000002'
        and q.user_id <> 'e1000000-0000-0000-0000-000000000007'
        and not exists (select 1 from public.meeting_questioners mq
                         where mq.meeting_id = 'f0000000-0000-0000-0000-000000000005'
                           and mq.user_id = q.user_id)
      order by q.user_id limit 1) as y;
grant select on b6 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       'f0000000-0000-0000-0000-000000000005', (select x from b6), (select y from b6)) $$,
  '42501', NULL, 'a non-admin cannot replace a questioner');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_replace_questioner(
       'f0000000-0000-0000-0000-000000000005', (select x from b6), (select x from b6)) $$,
  'P0001', '替補人選不可與被移除者相同', 'the replacement cannot be the member removed');
select throws_ok(
  $$ select public.meetings_replace_questioner(
       'f0000000-0000-0000-0000-000000000005', (select x from b6),
       'e2000000-0000-0000-0000-000000000005') $$,
  'P0001', '替補人選不可為本週報告人', 'the replacement cannot be the week''s presenter');
select throws_ok(
  $$ select public.meetings_replace_questioner(
       'f0000000-0000-0000-0000-000000000005', (select x from b6),
       'e1000000-0000-0000-0000-000000000002') $$,
  'P0001', '替補人選無法排入本週（不在名冊、停用中、晚於本週才加入，或不在輪替範圍）',
  'a graduate is refused as a replacement, with a reason');
select lives_ok(
  $$ select public.meetings_replace_questioner(
       'f0000000-0000-0000-0000-000000000005', (select x from b6), (select y from b6)) $$,
  'an admin replaces a questioner by name');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select results_eq(
  $$ select user_id, source from public.meeting_questioners
     where meeting_id = 'f0000000-0000-0000-0000-000000000005'
       and user_id in ((select x from b6), (select y from b6)) $$,
  $$ select (select y from b6), 'manual'::text $$,
  'after the reconcile the replacement stays pinned and the removed member is not put back'
);
select ok(
  exists (select 1 from public.meeting_questioner_exclusions
           where meeting_id = 'f0000000-0000-0000-0000-000000000005'
             and user_id = (select x from b6)),
  'the removal is recorded as an exclusion'
);
select ok(
  not public.meetings_questioner_can_serve((select x from b6),
        'f0000000-0000-0000-0000-000000000005', pg_temp.w(5),
        'e2000000-0000-0000-0000-000000000005', true)
  and public.meetings_questioner_can_serve((select x from b6),
        'f0000000-0000-0000-0000-000000000005', pg_temp.w(5),
        'e2000000-0000-0000-0000-000000000005', false),
  'the exclusion binds the automation, not an admin'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_replace_questioner(
  'f0000000-0000-0000-0000-000000000005', (select y from b6), (select x from b6));
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select ok(
  exists (select 1 from public.meeting_questioners
           where meeting_id = 'f0000000-0000-0000-0000-000000000005'
             and user_id = (select x from b6) and source = 'manual')
  and not exists (select 1 from public.meeting_questioner_exclusions
                   where meeting_id = 'f0000000-0000-0000-0000-000000000005'
                     and user_id = (select x from b6)),
  'an admin may put an excluded member back by hand, which lifts the exclusion'
);

create temp table b6_auto as
  select user_id from public.meeting_questioners
  where meeting_id = 'f0000000-0000-0000-0000-000000000005'
    and user_id <> (select x from b6)
  order by user_id limit 1;
grant select on b6_auto to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_replace_questioner(
  'f0000000-0000-0000-0000-000000000005', (select user_id from b6_auto), null);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select count(*) from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-000000000005'
      and user_id not in ((select user_id from b6_auto), (select y from b6))) = 3,
  'the system suggestion is neither the member removed nor anyone excluded from the week'
);
select pg_temp.settle();

-- ── B7. #1164: remove_week pulls a manual seat before its holder joined ───
-- R7 joins on W5's date and is hand-placed on W5 (as a fourth, pinned seat).
-- Removing W2 pulls W5 onto W2's date — before R7 joined — so the seat is no
-- longer valid and must go.

insert into public.meeting_question_pool (user_id, joined_on)
values ('e1000000-0000-0000-0000-000000000007', pg_temp.w(5));
insert into public.meeting_questioners (meeting_id, user_id, source)
values ('f0000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000007', 'manual');
select pg_temp.settle();

select ok(
  exists (select 1 from public.meeting_questioners
           where meeting_id = 'f0000000-0000-0000-0000-000000000005'
             and user_id = 'e1000000-0000-0000-0000-000000000007'),
  'a manual seat on a week its holder has joined by survives the reconcile'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_remove_week('f0000000-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select scheduled_date from public.meetings where id = 'f0000000-0000-0000-0000-000000000005'),
  pg_temp.w(2),
  'remove_week pulls W5 up to W2''s date, past the anchored holiday'
);
select pg_temp.settle();
select ok(
  not exists (select 1 from public.meeting_questioners
               where meeting_id = 'f0000000-0000-0000-0000-000000000005'
                 and user_id = 'e1000000-0000-0000-0000-000000000007'),
  'and the reconcile drops the seat that now predates its holder (#1164)'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat after remove_week');

-- ── B8. insert_week: many row moves, one reconcile ────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_insert_week('f0000000-0000-0000-0000-000000000001');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.pending(), 1, 'insert_week moves several rows and queues one reconcile');
select pg_temp.settle();
select is(
  (select count(*)::int from public.meeting_questioners mq
    join public.meetings m on m.id = mq.meeting_id
   where m.scheduled_date = pg_temp.w(1)),
  0,
  'the blank week insert_week opens has no presenter and so no questioners'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'still within one seat after insert_week');

-- ── B9. an ordinary member claims a week ──────────────────────────────────

insert into public.meetings (id, week_label, scheduled_date) values
  ('f0000000-0000-0000-0000-00000000000c', 'CLAIM', pg_temp.w(9)),
  ('f0000000-0000-0000-0000-00000000000e', 'GONE', pg_temp.today() - 21);
select pg_temp.settle();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_claim('f0000000-0000-0000-0000-00000000000e') $$,
  'P0001', '已經過去的週次無法認領', 'a week that has passed cannot be claimed');
select lives_ok(
  $$ select public.meetings_claim('f0000000-0000-0000-0000-00000000000c') $$,
  'a member claims an open week');
select pg_temp.settle();
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-00000000000c'),
  3,
  'the claimed week is staffed at commit, under the member''s own JWT'
);

-- ── B10. the admin's full rebalance ───────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.meetings_rebalance_questioners(true) $$,
  '42501', 'Forbidden: 僅管理員可重新平衡提問人',
  'a non-admin is refused by the rebalance wrapper');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(
  (select r ? 'dryRun' and r ? 'assigned' and r ? 'weeks' and r ? 'frozenDate'
          and r ? 'added' and r ? 'removed' and (r->>'full')::boolean
     from (select public.meetings_rebalance_questioners(true) as r) t),
  'the dry run still answers in the shape the deployed panel reads'
);
select public.meetings_rebalance_questioners(false);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  exists (select 1 from public.meeting_questioners
           where meeting_id = 'f0000000-0000-0000-0000-000000000005'
             and user_id = (select x from b6) and source = 'manual'),
  'a full rebalance keeps manual seats'
);
select cmp_ok(pg_temp.spread(), '<=', 1.000001, 'and lands within one seat');
select results_eq(
  $$ select (r->>'added')::int, (r->>'removed')::int
       from (select public.meetings_reconcile_questioners(false, true) as r) t $$,
  $$ values (0, 0) $$,
  'after which the automatic reconcile has nothing to change'
);

-- ── B11. history: a past week flagged as a holiday ────────────────────────

insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('f0000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'auto');

create temp table b11 as
  select times_asked, opportunities from public.meeting_question_rotation
  where user_id = 'e1000000-0000-0000-0000-000000000001';

update public.meetings set is_holiday = true
where id = 'f0000000-0000-0000-0000-00000000000a';
select pg_temp.settle();

select ok(
  exists (select 1 from public.meeting_questioners
           where meeting_id = 'f0000000-0000-0000-0000-00000000000a'),
  'the reconcile leaves a past week''s rows alone, even once it is a holiday'
);
select results_eq(
  $$ select times_asked, opportunities from public.meeting_question_rotation
     where user_id = 'e1000000-0000-0000-0000-000000000001' $$,
  $$ select times_asked - 1, opportunities - 1 from b11 $$,
  'but the week drops out of both sides of the rate at once'
);

-- ═══ D. boundaries ═════════════════════════════════════════════════════════

-- D1. A pause starts tomorrow. R4 holds a hand-placed seat today and one
-- tomorrow; switching R4 off takes the second, never the first.
insert into public.meetings (id, week_label, scheduled_date, presenter, presenter_user_id) values
  ('f0000000-0000-0000-0000-00000000000d', 'TMRW', pg_temp.today() + 1, 'X5', 'e2000000-0000-0000-0000-000000000005');
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('f0000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000004', 'manual'),
  ('f0000000-0000-0000-0000-00000000000d', 'e1000000-0000-0000-0000-000000000004', 'manual');
select pg_temp.settle();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000004', false);
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle();

select results_eq(
  $$ select meeting_id from public.meeting_questioners
     where user_id = 'e1000000-0000-0000-0000-000000000004'
       and meeting_id in ('f0000000-0000-0000-0000-00000000000b',
                          'f0000000-0000-0000-0000-00000000000d') $$,
  $$ values ('f0000000-0000-0000-0000-00000000000b'::uuid) $$,
  'a pause switched on today takes tomorrow''s seat and leaves today''s'
);
select is(
  (select count(*)::int from public.meeting_questioners
    where meeting_id = 'f0000000-0000-0000-0000-00000000000d'),
  3,
  'tomorrow''s week — now the freeze week — is refilled'
);
select results_eq(
  $$ select times_asked::int, opportunities from public.meeting_question_rotation
     where user_id = 'e1000000-0000-0000-0000-000000000004' $$,
  $$ values (1, 1) $$,
  'today''s seat still counts, on both sides of the rate'
);

-- The resumed_on end of the interval, read straight off the rule.
update public.meeting_question_pool_pauses set paused_on = pg_temp.today() - 7
where user_id = 'e1000000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000004', true);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not public.meetings_questioner_can_serve('e1000000-0000-0000-0000-000000000004',
        'f0000000-0000-0000-0000-00000000000b', pg_temp.today(),
        'e2000000-0000-0000-0000-000000000006', false)
  and public.meetings_questioner_can_serve('e1000000-0000-0000-0000-000000000004',
        'f0000000-0000-0000-0000-00000000000d', pg_temp.today() + 1,
        'e2000000-0000-0000-0000-000000000005', true),
  'resuming today reopens tomorrow: still paused on resumed_on − 1, eligible on it'
);
select pg_temp.settle();

-- D2. A seat held by someone who is not on the roster at all goes, even on
-- the freeze week. (Nothing but the functions writes meeting_questioners, and
-- a write there queues nothing by design, so the queue entry is made by hand.)
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('f0000000-0000-0000-0000-00000000000d', 'e2000000-0000-0000-0000-000000000002', 'manual');
select public.meetings_request_reconcile();
select pg_temp.settle();
select ok(
  not exists (select 1 from public.meeting_questioners
               where meeting_id = 'f0000000-0000-0000-0000-00000000000d'
                 and user_id = 'e2000000-0000-0000-0000-000000000002'),
  'a seat whose holder is not on the roster is removed, freeze week or not'
);
select is(
  (select (r->>'added')::int + (r->>'removed')::int
     from (select public.meetings_reconcile_questioners(false, true) as r) t),
  0,
  'a reconcile right after one that refilled the freeze week changes nothing'
);

-- D3. Fewer people than seats: switch four members off and nothing errors,
-- weeks simply run short, and none is short while someone could fill it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000001', false);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000003', false);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000005', false);
select public.meetings_question_pool_set_enabled('e1000000-0000-0000-0000-000000000006', false);
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok($$ select pg_temp.settle() $$, 'a roster too small for three seats a week does not error');
select ok(
  exists (
    select 1 from public.meetings m
    where m.scheduled_date > pg_temp.today()
      and m.presenter_user_id is not null and not m.is_holiday
      and (select count(*) from public.meeting_questioners q where q.meeting_id = m.id) < 3),
  'weeks run short when there is nobody left to take the seat'
);
select is(pg_temp.understaffed(), 0, 'but never while someone could take it');

-- D4. The co-pairing tie-break, measured directly. Far in the past, so no
-- reconcile below ever sees these weeks.
insert into public.meetings (id, week_label, scheduled_date) values
  ('f2000000-0000-0000-0000-000000000001', 'CP1', pg_temp.today() - 400),
  ('f2000000-0000-0000-0000-000000000002', 'CP2', pg_temp.today() - 393),
  ('f2000000-0000-0000-0000-000000000003', 'CP3', pg_temp.today() - 330);
insert into public.meeting_questioners (meeting_id, user_id, source) values
  ('f2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000005', 'manual'),
  ('f2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000006', 'manual'),
  ('f2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000006', 'manual'),
  ('f2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000006', 'manual');

select is(
  public.meetings_recent_copair_count('e1000000-0000-0000-0000-000000000005',
                                      'f2000000-0000-0000-0000-000000000002'),
  1,
  'a candidate who sat with this week''s roster a week ago scores one'
);
select is(
  public.meetings_recent_copair_count('e1000000-0000-0000-0000-000000000005',
                                      'f2000000-0000-0000-0000-000000000003'),
  0,
  'a pairing older than 56 days has stopped counting'
);
select is(
  public.meetings_recent_copair_count('e1000000-0000-0000-0000-000000000001',
                                      'f2000000-0000-0000-0000-000000000002'),
  0,
  'a candidate who has never sat with them scores zero'
);

-- ═══ C. structure ══════════════════════════════════════════════════════════

-- Every table whose writes can change who should ask takes the rebalance key
-- in a BEFORE … FOR EACH STATEMENT trigger, ahead of any row lock (#1153).
-- tgtype bit 0 = ROW, bit 1 = BEFORE.
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where t.tgfoid = 'public.meetings_take_questioner_lock()'::regprocedure
      and (t.tgtype & 1) = 0 and (t.tgtype & 2) = 2),
  array['meeting_presenter_pool', 'meeting_question_pool', 'meeting_question_pool_pauses',
        'meeting_questioner_exclusions', 'meeting_questioners', 'meetings'],
  'the lock-first statement trigger sits on every table in the chain'
);

select is(
  (select tgdeferrable and tginitdeferred from pg_trigger
    where tgname = 'meetings_reconcile_fire'),
  true,
  'the reconcile fires deferred, at COMMIT'
);

-- The key is taken as a live statement, before the first meetings read or
-- row lock (20260914170716's invariant).
select is(
  (select count(*)::int
     from unnest(array['public.meetings_replace_questioner(uuid,uuid,uuid)',
                       'public.meetings_swap(uuid,uuid)',
                       'public.meetings_claim(uuid)',
                       'public.meetings_insert_week(uuid)',
                       'public.meetings_remove_week(uuid)',
                       'public.meetings_append_week(integer,smallint)',
                       'public.meetings_reconcile_questioners(boolean,boolean)',
                       'public.meetings_question_pool_add(uuid)',
                       'public.meetings_question_pool_remove(uuid)',
                       'public.meetings_question_pool_set_enabled(uuid,boolean)']) f(sig)
    cross join lateral (
      select regexp_replace(pg_get_functiondef(f.sig::regprocedure), '--[^\n]*', '', 'g') as d
    ) x
    where x.d ~ '(^|\n)\s*perform pg_advisory_xact_lock\(hashtext\(''meetings_rebalance_questioners''\)\);'
      and position('pg_advisory_xact_lock' in x.d) < least(
            coalesce(nullif(position('select * into v_' in x.d), 0), 2147483647),
            coalesce(nullif(position('for update' in x.d), 0), 2147483647),
            coalesce(nullif(position('from public.meetings' in x.d), 0), 2147483647))),
  10,
  'every writer takes the same key, as a live statement, before touching meetings'
);

-- PostgREST sessions preload safeupdate, which rejects a DELETE or UPDATE
-- with no WHERE clause even inside a function. This suite runs as postgres,
-- which does not load it, so a bare `delete from rq_bfs;` passed every test
-- here and failed every repairing COMMIT made through the API. Checked by
-- reading the bodies instead.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral (
       select regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') as d
     ) x
    where n.nspname = 'public'
      and p.proname like 'meetings\_%'
      and p.prokind = 'f'
      and exists (
        select 1 from regexp_split_to_table(x.d, ';') stmt
        where stmt ~* '^\s*(delete\s+from|update)\s'
          and stmt !~* '\mwhere\M')),
  '{}'::text[],
  'no meetings function issues a DELETE or UPDATE that safeupdate would reject'
);

select ok(
  not has_table_privilege('anon', 'public.meeting_question_pool_pauses', 'insert')
  and not has_table_privilege('anon', 'public.meeting_questioner_exclusions', 'insert')
  and not has_table_privilege('authenticated', 'public.meeting_question_pool_pauses', 'insert')
  and not has_table_privilege('authenticated', 'public.meeting_questioner_exclusions', 'delete')
  and not has_table_privilege('authenticated', 'public.meetings_reconcile_pending', 'select')
  and not has_table_privilege('service_role', 'public.meeting_question_pool_pauses', 'insert')
  and not has_table_privilege('service_role', 'public.meetings_reconcile_pending', 'insert')
  and not has_table_privilege('authenticated', 'public.meeting_questioners', 'insert')
  and not has_table_privilege('authenticated', 'public.meeting_questioners', 'delete')
  and not has_table_privilege('service_role', 'public.meeting_questioners', 'insert'),
  'the new tables and meeting_questioners are written only through the functions'
);
select ok(
  not has_table_privilege('anon', 'public.meeting_questioner_stats', 'select')
  and not has_table_privilege('anon', 'public.meeting_question_rotation', 'select'),
  'anon reads none of the questioner views'
);

select * from finish();
rollback;
