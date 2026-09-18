-- Questioner roster restructure + reconcile-on-commit (#1173; closes #1153, #1164).
--
-- Expand half of an expand/contract pair. Everything the currently deployed
-- frontend calls keeps working against this schema (see §9); the contract
-- migration that removes those shims ships in a follow-up PR once the new
-- frontend is live.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
--
-- 1. "Who asks questions" was meeting_question_pool ∪ meeting_presenter_pool,
--    re-derived in five places (stats view, rotation view, rebalance_exec,
--    sync's eviction clause, replace's membership check). On 2026-09-18 12 of
--    the 19 members sat in BOTH tables and none sat only in the question pool,
--    so the panel titled 「額外提問成員（報告人以外）」 listed twelve presenters.
--
-- 2. The fairness clock, pool_added_at, was min(created_at) across the two
--    tables: a derived value that moved whenever a row was deleted from either
--    one (removing the question-pool row of a member who sat in both would
--    have moved their clock from 2026-06-15 to 2026-08-08 and changed their
--    rate).
--
-- 3. Fairness was maintained only when a week GAINED a roster (sync's greedy
--    fill) or when a pool changed (full rebalance). Every operation that TAKES
--    seats away — remove_week, a direct delete, flagging a holiday or speaker
--    week, clearing or changing a presenter, a manual replacement, a member
--    graduating in the nightly lab_status sync — left the affected members
--    short, and nothing ever paid them back. The one correction that existed,
--    the full rebalance, rewrote every future auto row on each pool change.
--
-- ── THE MODEL ──────────────────────────────────────────────────────────────
--
-- * meeting_question_pool is now THE roster: one row per questioner, with an
--   explicit joined_on as the fairness clock. Presenter-pool membership is
--   mirrored into it by trigger (join → row; leave → row removed). Whether a
--   member is a 「報告人」 (default questioner) or an 「額外」 member is not
--   stored; it is exists(meeting_presenter_pool). "An extra member cannot be a
--   presenter" therefore holds by construction.
-- * meeting_question_pool_pauses records when a member was switched off.
--   Paused weeks are not opportunities, and everything before the pause keeps
--   counting — pausing does not wipe anyone's record.
-- * meeting_questioner_exclusions is the negative of a manual pin: when an
--   admin swaps X out of a week, X is not automatically put back into it.
-- * meetings_questioner_can_serve is the ONE eligibility rule; reconcile and
--   replace both call it.
-- * meetings_reconcile_questioners runs once per transaction, at COMMIT, after
--   anything that can change who should ask: schedule edits, roster, pauses,
--   exclusions, lab_status. It only ever writes weeks AFTER today.
--
-- Fairness is unchanged from #1140: rate = seats held (incl. scheduled) ÷
-- opportunities, opportunities = non-holiday weeks with a roster since
-- joined_on, minus weeks one presents — and now minus weeks one was paused.
--
-- The reconcile is minimal-change: it computes each member's fractional fair
-- share of the future seats, then moves a seat only when two members are more
-- than one seat apart relative to their shares — and then only the fewest
-- seats, in the latest weeks. An edit that leaves everyone within one seat of
-- fair changes nothing. The admin 「完整重排」 runs the same algorithm from the
-- pinned seats alone. Details in §6.
--
-- ── STATEMENT ORDER MATTERS ────────────────────────────────────────────────
--
-- The old statement triggers on both pool tables run a full rebalance on any
-- insert. They are dropped FIRST, the roster is backfilled SECOND, and the new
-- triggers are created only after that — otherwise backfilling the seven
-- presenter-only members would reshuffle prod before anyone can check that
-- every member's rate came through unchanged.

-- ── 1. retire the old pool-change rebalance ────────────────────────────────

drop trigger if exists meeting_presenter_pool_rebalance_ins on public.meeting_presenter_pool;
drop trigger if exists meeting_presenter_pool_rebalance_del on public.meeting_presenter_pool;
drop trigger if exists meeting_question_pool_rebalance_ins on public.meeting_question_pool;
drop trigger if exists meeting_question_pool_rebalance_del on public.meeting_question_pool;
drop function if exists public.meetings_pool_changed();

-- ── 2. the roster ──────────────────────────────────────────────────────────

-- The default keeps the deployed frontend's plain upsert working until the
-- contract migration revokes table DML.
alter table public.meeting_question_pool
  add column joined_on date not null
    default ((now() at time zone 'Asia/Taipei')::date);

-- Exactly the lower bound every rate query used: min(created_at) across both
-- pools, read as a Taipei calendar date.
update public.meeting_question_pool q
set joined_on = (
  least(
    q.created_at,
    coalesce(
      (select pp.created_at from public.meeting_presenter_pool pp
        where pp.user_id = q.user_id),
      q.created_at
    )
  ) at time zone 'Asia/Taipei'
)::date;

insert into public.meeting_question_pool (user_id, created_at, joined_on)
select pp.user_id, pp.created_at, (pp.created_at at time zone 'Asia/Taipei')::date
from public.meeting_presenter_pool pp
on conflict (user_id) do nothing;

comment on table public.meeting_question_pool is
  'Every questioner, one row each. 報告人 vs 額外 is exists(meeting_presenter_pool), '
  'which is mirrored in by meetings_presenter_pool_to_roster.';
comment on column public.meeting_question_pool.joined_on is
  'Start of the fairness clock (Asia/Taipei date). Nothing before it counts as an '
  'opportunity or a seat, and nobody is placed on a week before it.';

-- ── 3. pauses, exclusions, the reconcile queue ─────────────────────────────

create table public.meeting_question_pool_pauses (
  user_id    uuid not null references public.meeting_question_pool (user_id) on delete cascade,
  paused_on  date not null,
  resumed_on date,
  created_at timestamptz not null default now(),
  primary key (user_id, paused_on),
  constraint meeting_question_pool_pauses_order check (resumed_on is null or resumed_on > paused_on)
);
create unique index meeting_question_pool_pauses_one_open
  on public.meeting_question_pool_pauses (user_id) where resumed_on is null;

comment on table public.meeting_question_pool_pauses is
  'Half-open [paused_on, resumed_on) spans during which a member takes no seats and '
  'accrues no opportunities. Both ends are "tomorrow" at the time of the switch, so '
  'today''s meeting is never affected.';

create table public.meeting_questioner_exclusions (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references public.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

comment on table public.meeting_questioner_exclusions is
  'An admin swapped this member out of this meeting. Automatic placement skips the '
  'pair; a manual placement clears it. Keyed by meeting id, so it travels with the '
  'meeting under insert/remove_week exactly like meeting_questioners does.';

-- One row per transaction that has something to reconcile. The deferred
-- constraint trigger on it is the only thing that runs the reconcile.
create table public.meetings_reconcile_pending (
  txid bigint primary key
);

alter table public.meeting_question_pool_pauses enable row level security;
alter table public.meeting_questioner_exclusions enable row level security;
alter table public.meetings_reconcile_pending enable row level security;

-- Invoker views read the pauses, so authenticated must see them. Nobody but
-- the SECURITY DEFINER functions writes any of the three — service_role
-- included, which Supabase's default privileges would otherwise hand full DML.
create policy "authenticated read meeting_question_pool_pauses"
  on public.meeting_question_pool_pauses for select to authenticated using (true);
create policy "authenticated read meeting_questioner_exclusions"
  on public.meeting_questioner_exclusions for select to authenticated using (true);

revoke all on public.meeting_question_pool_pauses from public, anon, authenticated, service_role;
revoke all on public.meeting_questioner_exclusions from public, anon, authenticated, service_role;
revoke all on public.meetings_reconcile_pending from public, anon, authenticated, service_role;
grant select on public.meeting_question_pool_pauses to authenticated, service_role;
grant select on public.meeting_questioner_exclusions to authenticated, service_role;

-- meeting_questioners is written only by SECURITY DEFINER functions from here
-- on. A direct write would skip the reconcile — there is deliberately no arm
-- trigger on this table, since the reconcile's own writes land here — so a
-- deleted seat would simply never be paid back. The deployed frontend only
-- ever reads it, so this does not wait for the contract migration.
drop policy if exists "meetings admin write meeting_questioners" on public.meeting_questioners;
revoke insert, update, delete, truncate on public.meeting_questioners
  from public, anon, authenticated, service_role;

-- ── 4. the single eligibility rule ─────────────────────────────────────────

create or replace function public.meetings_week_takes_questioners(
  p_is_holiday boolean, p_is_speaker boolean, p_presenter uuid
)
returns boolean
language sql
immutable
parallel safe
as $$
  select not coalesce(p_is_holiday, false)
     and not coalesce(p_is_speaker, false)
     and p_presenter is not null
$$;

-- p_new_pick = true is the automation choosing someone; false is either
-- keeping a seat someone already holds or an admin choosing by hand. The two
-- differ in exactly two ways, both inherited: a NULL lab_status (Keycloak has
-- no opinion yet — 20260831140000) keeps a seat but is never newly placed, and
-- an exclusion only binds the automation.
create or replace function public.meetings_questioner_can_serve(
  p_user uuid, p_meeting_id uuid, p_date date, p_presenter uuid, p_new_pick boolean
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_user is distinct from p_presenter
     and exists (
       select 1 from public.meeting_question_pool q
       where q.user_id = p_user and q.joined_on <= p_date
     )
     and not exists (
       select 1 from public.meeting_question_pool_pauses z
       where z.user_id = p_user
         and z.paused_on <= p_date
         and (z.resumed_on is null or p_date < z.resumed_on)
     )
     and (
       not p_new_pick
       or not exists (
         select 1 from public.meeting_questioner_exclusions e
         where e.meeting_id = p_meeting_id and e.user_id = p_user
       )
     )
     and coalesce((
       select case
                when up.lab_status is null then not p_new_pick
                else public.meetings_is_rotation_member(up.lab_status)
              end
       from public.user_profiles up
       where up.id = p_user
     ), false)
$$;

revoke all on function public.meetings_week_takes_questioners(boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.meetings_questioner_can_serve(uuid, uuid, date, uuid, boolean) from public, anon, authenticated;
grant execute on function public.meetings_week_takes_questioners(boolean, boolean, uuid) to service_role;
grant execute on function public.meetings_questioner_can_serve(uuid, uuid, date, uuid, boolean) to service_role;

-- ── 5. views ───────────────────────────────────────────────────────────────
--
-- Recreated rather than replaced: pool_added_at gives way to joined_on, and
-- create or replace view cannot rename a column.

drop view if exists public.meeting_question_pool_members;
drop view if exists public.meeting_question_rotation;
drop view if exists public.meeting_questioner_stats;

-- Seats and opportunities are both counted on non-holiday weeks only, so a
-- week flagged as a holiday after the fact drops out of both sides at once
-- instead of leaving its seats in the numerator. (Reconcile no longer deletes
-- rows on today or earlier; this keeps such a flag reversible.)
create view public.meeting_questioner_stats
with (security_invoker = true) as
with staffed as (
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where not m.is_holiday
    and exists (
      select 1 from public.meeting_questioners q where q.meeting_id = m.id
    )
)
select
  p.user_id,
  p.joined_on,
  coalesce(a.times_asked, 0) as times_asked,
  coalesce(a.times_asked_scheduled, 0) as times_asked_scheduled,
  a.last_asked_date,
  coalesce(o.opportunities, 0) as opportunities,
  case
    when coalesce(o.opportunities, 0) = 0 then 0::numeric
    else round(
      (coalesce(a.times_asked, 0) + coalesce(a.times_asked_scheduled, 0))::numeric
        / o.opportunities,
      6
    )
  end as rate
from public.meeting_question_pool p
left join lateral (
  select count(*)::int as opportunities
  from staffed s
  where s.scheduled_date >= p.joined_on
    and (s.presenter_user_id is null or s.presenter_user_id <> p.user_id)
    and not exists (
      select 1 from public.meeting_question_pool_pauses z
      where z.user_id = p.user_id
        and s.scheduled_date >= z.paused_on
        and (z.resumed_on is null or s.scheduled_date < z.resumed_on)
    )
) o on true
left join lateral (
  select
    count(*) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    )::int as times_asked,
    count(*) filter (
      where m.scheduled_date > (now() at time zone 'Asia/Taipei')::date
    )::int as times_asked_scheduled,
    max(m.scheduled_date) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    ) as last_asked_date
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  where mq.user_id = p.user_id
    and m.scheduled_date >= p.joined_on
    and not m.is_holiday
) a on true;

-- pool_added_at survives the expand phase only: the deployed frontend orders
-- by it. The contract migration drops it.
create view public.meeting_question_rotation
with (security_invoker = true) as
select
  st.user_id,
  up.name,
  up.email,
  st.joined_on,
  (st.joined_on::timestamp at time zone 'Asia/Taipei') as pool_added_at,
  st.last_asked_date,
  st.times_asked::bigint as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active,
  st.times_asked_scheduled,
  st.opportunities,
  st.rate,
  -- The reason behind is_active, for the panel's 「未排程」 hint — the same
  -- column meeting_presenter_roster already exposes.
  up.lab_status,
  not exists (
    select 1 from public.meeting_question_pool_pauses z
    where z.user_id = st.user_id and z.resumed_on is null
  ) as is_enabled,
  exists (
    select 1 from public.meeting_presenter_pool pp where pp.user_id = st.user_id
  ) as is_presenter
from public.meeting_questioner_stats st
join public.user_profiles up on up.id = st.user_id
order by st.rate, st.last_asked_date nulls first, st.joined_on, st.user_id;

-- Expand-phase shim with its old column list: the deployed panel still reads
-- it. It now lists exactly the 額外 members (zero rows after this migration).
create view public.meeting_question_pool_members
with (security_invoker = true) as
select
  r.user_id, r.name, r.email, r.pool_added_at, r.last_asked_date,
  r.times_asked, r.is_active, r.times_asked_scheduled, r.opportunities, r.rate
from public.meeting_question_rotation r
where not r.is_presenter;

revoke all on public.meeting_questioner_stats from public, anon, authenticated;
revoke all on public.meeting_question_rotation from public, anon, authenticated;
revoke all on public.meeting_question_pool_members from public, anon, authenticated;
grant select on public.meeting_questioner_stats to authenticated, service_role;
grant select on public.meeting_question_rotation to authenticated, service_role;
grant select on public.meeting_question_pool_members to authenticated, service_role;

-- ── 6. the reconcile ───────────────────────────────────────────────────────
--
-- One algorithm, two starting points. The automatic run starts from every
-- valid seat already held; the admin 「完整重排」 starts from the pinned seats
-- only. Either way:
--
--   ideal   For each rotation member, the seat count over rq_weeks that would
--           put every member at the same rate — water-filling: find the level
--           L at which Σ clamp(L·den_i − base_i, pinned_i, capacity_i) equals
--           the seats there are to hand out. It is fractional; deviation
--           d_i = held_i − ideal_i says how far a member is from their share.
--   fill    Vacant seats go, week by week, to the eligible member with the
--           lowest d, the #1140 order (rate, co-pairing, longest since last
--           asked, joined_on, user_id) breaking ties. The freeze week is
--           filled first and its new seats pinned like the rest of it, after
--           which the ideal is taken again with them as floors — the state a
--           second run starts from — so that run changes nothing.
--   repair  While some member j is MORE THAN ONE seat further above their
--           share than another member i is (d_j − d_i > 1), pass one seat
--           from j to i. Directly if j holds a seat on a week i can take;
--           otherwise along a chain — j's seat to k, k's seat to i — found by
--           breadth-first search, so everyone in the middle keeps their count
--           and only j and i change. (A direct move is often impossible: the
--           only weeks j can give up may be one i presents, or one i already
--           sits on.) A gap of exactly one is left alone: moving would only
--           swap who is ahead.
--
-- So an edit that leaves the roster within one seat of fair changes nothing,
-- and one that does not is fixed by the fewest seat moves, preferring the
-- latest weeks.
--
-- The one trade: the freeze week's seats — including ones this run places —
-- never move. Occasionally the only move that would close a gap runs through
-- that week, and the gap stays (≤ about one seat) until the week passes and
-- its seats become history, which the next run's shares absorb. Letting this
-- run move a seat it just placed there would make the next run, which sees
-- that seat as fixed, disagree with it — exactly the drift the pinning
-- exists to prevent. Each repair lowers Σd², so it terminates. Picking the target
-- counts from a fresh greedy instead (the first draft of this) moved people
-- needlessly whenever members were tied, which in prod most of them are.

create or replace function public.meetings_reconcile_questioners(
  p_full boolean, p_dry_run boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
-- `drop table if exists pg_temp.…` NOTICEs on a session's first run, and this
-- runs inside other people's COMMITs; keep that off their wire.
set client_min_messages = warning
as $$
declare
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
  v_freeze   date;
  v_week     record;
  v_donor    record;
  v_link     record;
  v_target   uuid;
  v_cur      uuid;
  v_depth    int;
  v_repaired boolean;
  v_pick     uuid;
  v_pass     int;
  v_seats    numeric;
  v_lo       numeric;
  v_hi       numeric;
  v_mid      numeric;
  v_sum      numeric;
  v_moves    int := 0;
  v_added    int;
  v_removed  int;
  v_weeks    int;
  v_assigned int;
  v_roster   jsonb;
  k          int;
begin
  -- Before any read, per the invariant in 20260914170716's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  drop table if exists pg_temp.rq_weeks;
  drop table if exists pg_temp.rq_current;
  drop table if exists pg_temp.rq_elig;
  drop table if exists pg_temp.rq_assign;
  drop table if exists pg_temp.rq_state;
  drop table if exists pg_temp.rq_bfs;

  -- Every week after today that should carry a roster. Today and earlier are
  -- never written: today's meeting may already have happened.
  create temporary table rq_weeks on commit drop as
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where m.scheduled_date > v_today
    and public.meetings_week_takes_questioners(m.is_holiday, m.is_speaker, m.presenter_user_id);

  -- The nearest of them is frozen: its valid seats are pinned, so only a
  -- vacancy there is ever filled.
  select min(scheduled_date) into v_freeze from rq_weeks;

  -- Seats currently held on those weeks that are still valid. Anything else
  -- after today — seats on weeks that no longer take questioners, seats that
  -- fail can_serve (left the roster, paused, graduated, now presenting, a
  -- manual seat pulled before its holder's joined_on by remove_week: #1164) —
  -- is absent here and is deleted by the diff at the end.
  create temporary table rq_current on commit drop as
  select mq.meeting_id, mq.user_id, mq.assigned_at, w.scheduled_date,
         (mq.source = 'manual'
          or up.lab_status is null
          or w.scheduled_date = v_freeze) as pinned
  from public.meeting_questioners mq
  join rq_weeks w on w.id = mq.meeting_id
  join public.user_profiles up on up.id = mq.user_id
  where public.meetings_questioner_can_serve(
          mq.user_id, mq.meeting_id, w.scheduled_date, w.presenter_user_id, false);

  -- Who the automation may newly place, week by week. Only rotation members
  -- qualify (can_serve with p_new_pick), and it does not depend on the
  -- assignment, so it is computed once.
  create temporary table rq_elig on commit drop as
  select w.id as meeting_id, q.user_id
  from rq_weeks w
  cross join public.meeting_question_pool q
  where public.meetings_questioner_can_serve(
          q.user_id, w.id, w.scheduled_date, w.presenter_user_id, true);

  create temporary table rq_assign (
    meeting_id     uuid not null,
    user_id        uuid not null,
    scheduled_date date not null,
    pinned         boolean not null,
    assigned_at    timestamptz,
    primary key (meeting_id, user_id)
  ) on commit drop;

  insert into rq_assign (meeting_id, user_id, scheduled_date, pinned, assigned_at)
  select meeting_id, user_id, scheduled_date, pinned, assigned_at
  from rq_current
  where pinned or not p_full;

  -- Never more than three unpinned seats on one week.
  delete from rq_assign a
  using (
    select meeting_id, user_id,
           row_number() over (
             partition by meeting_id
             order by pinned desc, assigned_at asc nulls last, user_id
           ) as rn
    from rq_assign
  ) d
  where d.meeting_id = a.meeting_id
    and d.user_id = a.user_id
    and d.rn > 3
    and not a.pinned;

  -- Per-member counters. den is the opportunity count over the weeks that
  -- carry a roster once this run is done — every non-holiday week up to today
  -- that has one, plus rq_weeks — the same snapshot #1140 introduced so that
  -- clearing seats cannot collapse anyone's denominator. base is what a
  -- member holds up to today; held is their seats in the working assignment.
  create temporary table rq_state on commit drop as
  with weeks as (
    select m.scheduled_date, m.presenter_user_id
    from public.meetings m
    where m.scheduled_date <= v_today
      and not m.is_holiday
      and exists (select 1 from public.meeting_questioners x where x.meeting_id = m.id)
    union all
    select w.scheduled_date, w.presenter_user_id from rq_weeks w
  )
  select
    q.user_id,
    q.joined_on,
    public.meetings_is_rotation_member(up.lab_status) as in_rotation,
    (select count(*)::int from weeks s
      where s.scheduled_date >= q.joined_on
        and (s.presenter_user_id is null or s.presenter_user_id <> q.user_id)
        and not exists (
          select 1 from public.meeting_question_pool_pauses z
          where z.user_id = q.user_id
            and s.scheduled_date >= z.paused_on
            and (z.resumed_on is null or s.scheduled_date < z.resumed_on)
        )
    ) as den,
    (select count(*)::int
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = q.user_id
        and m.scheduled_date <= v_today
        and m.scheduled_date >= q.joined_on
        and not m.is_holiday
    ) as base,
    (select max(m.scheduled_date)
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = q.user_id
        and m.scheduled_date <= v_today
        and m.scheduled_date >= q.joined_on
        and not m.is_holiday
    ) as last_asked_date,
    (select count(*)::int from rq_assign a
      where a.user_id = q.user_id and a.pinned) as pinned,
    (select count(*)::int from rq_weeks w
      where exists (select 1 from rq_elig e
                     where e.meeting_id = w.id and e.user_id = q.user_id)
         or exists (select 1 from rq_assign a
                     where a.meeting_id = w.id and a.user_id = q.user_id)
    ) as capacity,
    (select count(*)::int from rq_assign a where a.user_id = q.user_id) as held,
    null::numeric as ideal
  from public.meeting_question_pool q
  join public.user_profiles up on up.id = q.user_id;

  -- Fill, in two passes, each taking the ideal first. Pass 1 fills the
  -- freeze week alone and PINS what it places, raising those members'
  -- floors; pass 2 takes the ideal again with those floors and fills every
  -- other week. The floors are what the next run will see, so without the
  -- second ideal that run would reach a different one and move a seat after
  -- an edit that changed nothing.
  for v_pass in 1 .. 2 loop
    -- Seats the rotation members will share: each week ends with three
    -- seats, or fewer if fewer can serve, or more if more are pinned —
    -- minus the pinned seats of members outside the rotation (a NULL
    -- lab_status keeps what it holds but takes no share).
    select coalesce(sum(greatest(held_w, least(3, held_w + open_w))), 0)
    into v_seats
    from (
      select
        (select count(*) from rq_assign a where a.meeting_id = w.id) as held_w,
        (select count(*) from rq_elig e
          where e.meeting_id = w.id
            and not exists (select 1 from rq_assign a
                             where a.meeting_id = w.id and a.user_id = e.user_id)
        ) as open_w
      from rq_weeks w
    ) t;

    v_seats := v_seats - (
      select count(*) from rq_assign a
      join rq_state st on st.user_id = a.user_id
      where not st.in_rotation
    );

    -- Water-filling by bisection on L. Σ clamp(L·den − base, pinned,
    -- capacity) is non-decreasing in L; sixty halvings are far below a
    -- thousandth of a seat. A member with den = 0 sits at their pinned
    -- count whatever L is.
    v_lo := 0;
    select coalesce(max((capacity + base)::numeric / den), 0) + 1
    into v_hi
    from rq_state where in_rotation and den > 0;

    for k in 1 .. 60 loop
      v_mid := (v_lo + v_hi) / 2;
      select coalesce(sum(least(capacity, greatest(pinned, v_mid * den - base))), 0)
      into v_sum
      from rq_state where in_rotation;
      if v_sum < v_seats then
        v_lo := v_mid;
      else
        v_hi := v_mid;
      end if;
    end loop;

    update rq_state
    set ideal = least(capacity, greatest(pinned, v_hi * den - base))
    where in_rotation;

    for v_week in
      select id, scheduled_date from rq_weeks
      where (v_pass = 1) = (scheduled_date = v_freeze)
      order by scheduled_date, id
    loop
      loop
        exit when (select count(*) from rq_assign where meeting_id = v_week.id) >= 3;

        with roster as (
          select mq.user_id, m.scheduled_date
          from public.meeting_questioners mq
          join public.meetings m on m.id = mq.meeting_id
          where m.scheduled_date <= v_today
            and m.scheduled_date >= v_week.scheduled_date - 56
          union all
          select a.user_id, a.scheduled_date
          from rq_assign a
          where a.scheduled_date < v_week.scheduled_date
            and a.scheduled_date >= v_week.scheduled_date - 56
        ),
        paired as (
          select r1.user_id as a, r2.user_id as b
          from roster r1
          join roster r2
            on r2.scheduled_date = r1.scheduled_date and r2.user_id <> r1.user_id
          where r1.scheduled_date < v_week.scheduled_date
        )
        select st.user_id into v_pick
        from rq_state st
        join rq_elig e on e.meeting_id = v_week.id and e.user_id = st.user_id
        where not exists (
          select 1 from rq_assign a
          where a.meeting_id = v_week.id and a.user_id = st.user_id
        )
        order by
          st.held - st.ideal asc,
          case when st.den = 0 then 0::numeric
               else round((st.base + st.held)::numeric / st.den, 6) end asc,
          (select count(distinct a.user_id)
             from rq_assign a
             join paired pr on pr.a = st.user_id and pr.b = a.user_id
            where a.meeting_id = v_week.id) asc,
          st.last_asked_date asc nulls first,
          st.joined_on asc,
          st.user_id asc
        limit 1;

        exit when v_pick is null;

        insert into rq_assign (meeting_id, user_id, scheduled_date, pinned, assigned_at)
        values (v_week.id, v_pick, v_week.scheduled_date, v_pass = 1, null);
        update rq_state
        set held = held + 1,
            pinned = pinned + case when v_pass = 1 then 1 else 0 end
        where user_id = v_pick;
      end loop;
    end loop;
  end loop;

  -- Repair. Donors are taken widest-gap first; for each, a breadth-first
  -- search over "a's unpinned seat on week w could go to b" reaches members
  -- one hop, two hops … away, keeping for each the latest-week link. The
  -- first depth at which an under-served member is reached settles it: the
  -- shortest chain wins, then the lowest d. The chain is applied from the
  -- far end back, each link still valid because every week on it is
  -- distinct. Bounded as a backstop only.
  create temporary table rq_bfs (
    user_id        uuid primary key,
    depth          int not null,
    via_meeting    uuid,
    via_date       date,
    via_from       uuid
  ) on commit drop;

  loop
    exit when v_moves >= 1000;
    v_repaired := false;

    for v_donor in
      select user_id, held - ideal as d
      from rq_state
      where in_rotation
      order by held - ideal desc, user_id
    loop
      -- Donors come in descending d, so once one has nobody far enough
      -- below it, neither does anyone after it.
      exit when not exists (
        select 1 from rq_state
        where in_rotation and v_donor.d - (held - ideal) > 1.000001
      );

      v_target := null;
      -- `where true`, not a bare delete: PostgREST sessions preload Supabase's
      -- safeupdate, which rejects any DELETE/UPDATE without a WHERE clause —
      -- inside functions too, and this runs inside their COMMITs.
      delete from rq_bfs where true;
      insert into rq_bfs (user_id, depth) values (v_donor.user_id, 0);

      for v_depth in 1 .. 4 loop
        insert into rq_bfs (user_id, depth, via_meeting, via_date, via_from)
        select distinct on (e.user_id)
               e.user_id, v_depth, a.meeting_id, a.scheduled_date, a.user_id
        from rq_bfs f
        join rq_assign a on a.user_id = f.user_id and not a.pinned
        join rq_elig e on e.meeting_id = a.meeting_id
        where f.depth = v_depth - 1
          and not exists (select 1 from rq_bfs r where r.user_id = e.user_id)
          and not exists (
            select 1 from rq_assign x
            where x.meeting_id = a.meeting_id and x.user_id = e.user_id
          )
        order by e.user_id, a.scheduled_date desc, a.meeting_id;

        exit when not found;

        select b.user_id into v_target
        from rq_bfs b
        join rq_state st on st.user_id = b.user_id
        where b.depth = v_depth
          and st.in_rotation
          and v_donor.d - (st.held - st.ideal) > 1.000001
        order by st.held - st.ideal asc, b.user_id
        limit 1;

        exit when v_target is not null;
      end loop;

      continue when v_target is null;

      v_cur := v_target;
      loop
        select via_meeting, via_date, via_from into v_link
        from rq_bfs where user_id = v_cur;
        exit when v_link.via_meeting is null;

        delete from rq_assign
        where meeting_id = v_link.via_meeting and user_id = v_link.via_from;
        insert into rq_assign (meeting_id, user_id, scheduled_date, pinned, assigned_at)
        values (v_link.via_meeting, v_cur, v_link.via_date, false, null);
        v_moves := v_moves + 1;
        v_cur := v_link.via_from;
      end loop;

      update rq_state set held = held - 1 where user_id = v_donor.user_id;
      update rq_state set held = held + 1 where user_id = v_target;
      v_repaired := true;
      exit;
    end loop;

    exit when not v_repaired;
  end loop;

  -- The diff: everything after today that is not in the final assignment
  -- goes; everything in it that does not exist yet comes in as 'auto'. Seats
  -- that survive keep their source and their assigned_at.
  select count(*)::int into v_removed
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  where m.scheduled_date > v_today
    and not exists (
      select 1 from rq_assign a
      where a.meeting_id = mq.meeting_id and a.user_id = mq.user_id
    );

  select count(*)::int into v_added
  from rq_assign a
  where not exists (
    select 1 from public.meeting_questioners mq
    where mq.meeting_id = a.meeting_id and mq.user_id = a.user_id
  );

  if not p_dry_run then
    delete from public.meeting_questioners mq
    using public.meetings m
    where m.id = mq.meeting_id
      and m.scheduled_date > v_today
      and not exists (
        select 1 from rq_assign a
        where a.meeting_id = mq.meeting_id and a.user_id = mq.user_id
      );

    insert into public.meeting_questioners (meeting_id, user_id, source)
    select a.meeting_id, a.user_id, 'auto'
    from rq_assign a
    on conflict (meeting_id, user_id) do nothing;
  end if;

  select count(*)::int into v_weeks
  from rq_weeks where scheduled_date > v_freeze;

  select count(*)::int into v_assigned
  from rq_assign where scheduled_date > v_freeze;

  select coalesce(jsonb_agg(entry order by entry->>'date'), '[]'::jsonb)
  into v_roster
  from (
    select jsonb_build_object(
      'meetingId', w.id,
      'date', w.scheduled_date,
      'questioners', coalesce((
        select jsonb_agg(coalesce(up.name, up.email, a.user_id::text)
                         order by coalesce(up.name, up.email, a.user_id::text))
        from rq_assign a
        join public.user_profiles up on up.id = a.user_id
        where a.meeting_id = w.id
      ), '[]'::jsonb)
    ) as entry
    from rq_weeks w
    where w.scheduled_date > v_freeze
  ) t;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'full', p_full,
    'frozenDate', v_freeze,
    'weeks', v_weeks,
    'assigned', v_assigned,
    'added', v_added,
    'removed', v_removed,
    'moves', v_moves,
    'roster', v_roster,
    -- What the fairness judgement was made on, per rotation member: the
    -- repair guarantees max(held − ideal) − min(held − ideal) ≤ 1 wherever a
    -- move was feasible.
    'members', (
      select coalesce(jsonb_agg(
               jsonb_build_object('userId', user_id, 'held', held,
                                  'ideal', round(ideal, 3))
               order by user_id), '[]'::jsonb)
      from rq_state where in_rotation
    )
  );
end;
$$;

revoke all on function public.meetings_reconcile_questioners(boolean, boolean) from public, anon, authenticated;
grant execute on function public.meetings_reconcile_questioners(boolean, boolean) to service_role;

-- ── 7. running it: arm on change, fire once at COMMIT ──────────────────────
--
-- A row-level AFTER trigger on every table that can change who should ask
-- inserts this transaction's txid into meetings_reconcile_pending (on conflict
-- do nothing). The single deferred constraint trigger on that table deletes
-- the row and reconciles. One edit or a thousand, one reconcile per COMMIT;
-- and because the row is gone afterwards, any change made after an earlier
-- `SET CONSTRAINTS … IMMEDIATE` re-arms it and is reconciled too.
--
-- Every trigger function is SECURITY DEFINER with EXECUTE revoked: PG runs a
-- trigger as the role that queued the event, which for a direct PostgREST
-- write is authenticated.

create or replace function public.meetings_request_reconcile()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.meetings_reconcile_pending (txid)
  values (txid_current())
  on conflict (txid) do nothing;
$$;

create or replace function public.meetings_arm_reconcile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.meetings_request_reconcile();
  return null;
end;
$$;

-- lab_status changes for everyone in the lab; only roster members matter.
create or replace function public.meetings_arm_reconcile_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.meeting_question_pool where user_id = new.id) then
    perform public.meetings_request_reconcile();
  end if;
  return null;
end;
$$;

create or replace function public.meetings_fire_reconcile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.meetings_reconcile_pending where txid = new.txid;
  perform public.meetings_reconcile_questioners(false, false);
  return null;
end;
$$;

create constraint trigger meetings_reconcile_fire
  after insert on public.meetings_reconcile_pending
  deferrable initially deferred
  for each row execute function public.meetings_fire_reconcile();

create trigger meetings_arm_reconcile_ins_del
  after insert or delete on public.meetings
  for each row execute function public.meetings_arm_reconcile();

create trigger meetings_arm_reconcile_upd
  after update of scheduled_date, is_holiday, is_speaker, presenter_user_id
  on public.meetings
  for each row
  when (old.scheduled_date is distinct from new.scheduled_date
        or old.is_holiday is distinct from new.is_holiday
        or old.is_speaker is distinct from new.is_speaker
        or old.presenter_user_id is distinct from new.presenter_user_id)
  execute function public.meetings_arm_reconcile();

create trigger meeting_question_pool_arm_reconcile
  after insert or update or delete on public.meeting_question_pool
  for each row execute function public.meetings_arm_reconcile();

create trigger meeting_question_pool_pauses_arm_reconcile
  after insert or update or delete on public.meeting_question_pool_pauses
  for each row execute function public.meetings_arm_reconcile();

create trigger meeting_questioner_exclusions_arm_reconcile
  after insert or update or delete on public.meeting_questioner_exclusions
  for each row execute function public.meetings_arm_reconcile();

create trigger user_profiles_arm_meetings_reconcile
  after update of lab_status on public.user_profiles
  for each row
  when (public.meetings_is_rotation_member(old.lab_status)
          is distinct from public.meetings_is_rotation_member(new.lab_status)
        or (old.lab_status is null) <> (new.lab_status is null))
  execute function public.meetings_arm_reconcile_for_member();

-- ── 8. lock order and the presenter mirror ─────────────────────────────────
--
-- #1153: the rebalance key must be taken before any row lock by EVERY writer,
-- including a direct PostgREST delete and the FK cascade it sets off. A
-- BEFORE … FOR EACH STATEMENT trigger runs before the statement fetches or
-- locks a single row, so hanging the lock there covers paths no function
-- body can. (user_profiles needs none: the cron's FOR NO KEY UPDATE is
-- compatible with the FOR KEY SHARE a questioner insert takes.)

create or replace function public.meetings_take_questioner_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));
  return null;
end;
$$;

create trigger meetings_take_questioner_lock
  before insert or delete or update of scheduled_date, is_holiday, is_speaker, presenter_user_id
  on public.meetings
  for each statement execute function public.meetings_take_questioner_lock();

create trigger meeting_questioners_take_lock
  before insert or update or delete on public.meeting_questioners
  for each statement execute function public.meetings_take_questioner_lock();

create trigger meeting_question_pool_take_lock
  before insert or update or delete on public.meeting_question_pool
  for each statement execute function public.meetings_take_questioner_lock();

create trigger meeting_question_pool_pauses_take_lock
  before insert or update or delete on public.meeting_question_pool_pauses
  for each statement execute function public.meetings_take_questioner_lock();

create trigger meeting_questioner_exclusions_take_lock
  before insert or update or delete on public.meeting_questioner_exclusions
  for each statement execute function public.meetings_take_questioner_lock();

create trigger meeting_presenter_pool_take_lock
  before insert or delete on public.meeting_presenter_pool
  for each statement execute function public.meetings_take_questioner_lock();

-- Joining the presenter roster makes one a default questioner (an 額外 member
-- is promoted in place, keeping joined_on and any pause); leaving it ends
-- one's questioning too.
create or replace function public.meetings_presenter_pool_to_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.meeting_question_pool (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;
  else
    delete from public.meeting_question_pool where user_id = old.user_id;
  end if;
  return null;
end;
$$;

create trigger meeting_presenter_pool_to_roster
  after insert or delete on public.meeting_presenter_pool
  for each row execute function public.meetings_presenter_pool_to_roster();

-- Nobody asks at their own presentation. This is integrity rather than
-- scheduling, so unlike the reconcile it applies to any date.
create or replace function public.meetings_drop_presenter_questioner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.meeting_questioners
  where meeting_id = new.id and user_id = new.presenter_user_id;
  return null;
end;
$$;

create trigger meetings_drop_presenter_questioner
  after update of presenter_user_id on public.meetings
  for each row
  when (new.presenter_user_id is not null
        and new.presenter_user_id is distinct from old.presenter_user_id)
  execute function public.meetings_drop_presenter_questioner();

revoke all on function public.meetings_request_reconcile() from public, anon, authenticated, service_role;
revoke all on function public.meetings_arm_reconcile() from public, anon, authenticated, service_role;
revoke all on function public.meetings_arm_reconcile_for_member() from public, anon, authenticated, service_role;
revoke all on function public.meetings_fire_reconcile() from public, anon, authenticated, service_role;
revoke all on function public.meetings_take_questioner_lock() from public, anon, authenticated, service_role;
revoke all on function public.meetings_presenter_pool_to_roster() from public, anon, authenticated, service_role;
revoke all on function public.meetings_drop_presenter_questioner() from public, anon, authenticated, service_role;

-- ── 9. RPCs ────────────────────────────────────────────────────────────────

create or replace function public.meetings_question_pool_add(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理提問成員' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  select lab_status into v_status from public.user_profiles where id = p_user;
  if not found then
    raise exception '找不到此使用者' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.meeting_presenter_pool where user_id = p_user) then
    raise exception '此成員在報告順位名單中，已是預設提問人' using errcode = 'P0001';
  end if;

  if v_status is not null and not public.meetings_is_rotation_member(v_status) then
    raise exception '提問輪替只包含碩士生與博士生' using errcode = 'P0001';
  end if;

  insert into public.meeting_question_pool (user_id)
  values (p_user)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.meetings_question_pool_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理提問成員' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  if exists (select 1 from public.meeting_presenter_pool where user_id = p_user) then
    raise exception '預設提問人無法移除，請改用停用' using errcode = 'P0001';
  end if;

  -- Future seats go at COMMIT (the roster trigger arms the reconcile); past
  -- seats stay as history.
  delete from public.meeting_question_pool where user_id = p_user;
end;
$$;

-- Both switches take effect TOMORROW, so today's meeting — which may already
-- have happened — is never altered and its seats stay countable.
create or replace function public.meetings_question_pool_set_enabled(
  p_user uuid, p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tomorrow date := (now() at time zone 'Asia/Taipei')::date + 1;
  v_open     date;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理提問成員' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception '缺少啟用狀態' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  if not exists (select 1 from public.meeting_question_pool where user_id = p_user) then
    raise exception '此成員不在提問名冊中' using errcode = 'P0001';
  end if;

  select paused_on into v_open
  from public.meeting_question_pool_pauses
  where user_id = p_user and resumed_on is null;

  if p_enabled then
    if v_open is null then
      return;
    end if;
    if v_open >= v_tomorrow then
      -- Switched off and back on before it took effect: nothing happened.
      delete from public.meeting_question_pool_pauses
      where user_id = p_user and paused_on = v_open;
    else
      update public.meeting_question_pool_pauses
      set resumed_on = v_tomorrow
      where user_id = p_user and paused_on = v_open;
    end if;
  else
    if v_open is not null then
      return;
    end if;
    -- Switched back on today and off again: reopen that span rather than
    -- leaving a zero-length gap between two.
    update public.meeting_question_pool_pauses
    set resumed_on = null
    where user_id = p_user and resumed_on = v_tomorrow;
    if not found then
      insert into public.meeting_question_pool_pauses (user_id, paused_on)
      values (p_user, v_tomorrow);
    end if;
  end if;
end;
$$;

-- The admin 「完整重排」: phase 1 alone. Signature unchanged; the result keeps
-- dryRun/assigned for the deployed panel and adds added/removed.
create or replace function public.meetings_rebalance_questioners(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可重新平衡提問人' using errcode = '42501';
  end if;

  return public.meetings_reconcile_questioners(true, p_dry_run);
end;
$$;

-- Manual replacement. Eligibility is can_serve with p_new_pick = false (an
-- admin may overrule an exclusion and may pick a member Keycloak has not
-- classified yet). The member swapped out is excluded from this meeting so
-- the reconcile does not put them straight back; the replacement's own
-- exclusion, if any, is lifted. The reconcile then evens out the one-seat
-- shift this creates for both of them in later weeks.
create or replace function public.meetings_replace_questioner(
  p_meeting_id uuid, p_remove_user uuid, p_replacement uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meeting public.meetings;
  v_next    uuid;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可操作提問小組' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    raise exception '找不到此週次' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.meeting_questioners
    where meeting_id = p_meeting_id and user_id = p_remove_user
  ) then
    raise exception '此人目前不是本週提問小組成員' using errcode = 'P0001';
  end if;

  if p_replacement is not null then
    if p_replacement = p_remove_user then
      raise exception '替補人選不可與被移除者相同' using errcode = 'P0001';
    end if;
    if p_replacement = v_meeting.presenter_user_id then
      raise exception '替補人選不可為本週報告人' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.meeting_questioners
      where meeting_id = p_meeting_id and user_id = p_replacement
    ) then
      raise exception '替補人選已經是本週提問小組成員' using errcode = 'P0001';
    end if;
    if not public.meetings_questioner_can_serve(
      p_replacement, p_meeting_id, v_meeting.scheduled_date,
      v_meeting.presenter_user_id, false
    ) then
      raise exception '替補人選無法排入本週（不在名冊、停用中、晚於本週才加入，或不在輪替範圍）'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.meeting_questioners
  where meeting_id = p_meeting_id and user_id = p_remove_user;

  insert into public.meeting_questioner_exclusions (meeting_id, user_id)
  values (p_meeting_id, p_remove_user)
  on conflict do nothing;

  if p_replacement is null then
    select r.user_id into v_next
    from public.meeting_question_rotation r
    where public.meetings_questioner_can_serve(
            r.user_id, p_meeting_id, v_meeting.scheduled_date,
            v_meeting.presenter_user_id, true)
      and not exists (
        select 1 from public.meeting_questioners mq
        where mq.meeting_id = p_meeting_id and mq.user_id = r.user_id
      )
    order by r.rate asc,
             public.meetings_recent_copair_count(r.user_id, p_meeting_id) asc,
             r.last_asked_date asc nulls first,
             r.joined_on asc,
             r.user_id asc
    limit 1;
    p_replacement := v_next;
  end if;

  if p_replacement is not null then
    delete from public.meeting_questioner_exclusions
    where meeting_id = p_meeting_id and user_id = p_replacement;

    insert into public.meeting_questioners (meeting_id, user_id, source)
    values (p_meeting_id, p_replacement, 'manual')
    on conflict (meeting_id, user_id) do nothing;
  end if;

  perform public.meetings_request_reconcile();
end;
$$;

-- Expand-phase shims for the deployed frontend. Both go in the contract
-- migration.
create or replace function public.meetings_sync_questioners(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The reconcile already ran at the COMMIT of whatever edit preceded this
  -- call. Nothing is left to do, and a past week is never staffed.
  return;
end;
$$;

create or replace function public.meetings_remove_from_pool(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.meetings_question_pool_remove(p_user);
end;
$$;

revoke all on function public.meetings_question_pool_add(uuid) from public, anon;
revoke all on function public.meetings_question_pool_remove(uuid) from public, anon;
revoke all on function public.meetings_question_pool_set_enabled(uuid, boolean) from public, anon;
revoke all on function public.meetings_rebalance_questioners(boolean) from public, anon;
revoke all on function public.meetings_replace_questioner(uuid, uuid, uuid) from public, anon;
revoke all on function public.meetings_sync_questioners(uuid) from public, anon;
revoke all on function public.meetings_remove_from_pool(uuid) from public, anon;
grant execute on function public.meetings_question_pool_add(uuid) to authenticated, service_role;
grant execute on function public.meetings_question_pool_remove(uuid) to authenticated, service_role;
grant execute on function public.meetings_question_pool_set_enabled(uuid, boolean) to authenticated, service_role;
grant execute on function public.meetings_rebalance_questioners(boolean) to authenticated, service_role;
grant execute on function public.meetings_replace_questioner(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;
grant execute on function public.meetings_remove_from_pool(uuid) to authenticated, service_role;

-- ── 10. callers that used to sync ──────────────────────────────────────────
--
-- claim, swap and fill_presenters each called meetings_sync_questioners after
-- writing a presenter. The reconcile at COMMIT covers all of it now — fill in
-- particular reconciles once for the whole batch instead of once per week.
-- Bodies are otherwise the prod definitions as of 2026-09-18.

create or replace function public.meetings_claim(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting public.meetings;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Rebalance key BEFORE the row lock. See 20260914170716's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  select * into v_meeting
  from public.meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception '找不到此週次' using errcode = 'P0001';
  end if;

  if v_meeting.is_holiday then
    raise exception '假日週次無法認領' using errcode = 'P0001';
  end if;

  if v_meeting.is_speaker then
    raise exception '演講週無法認領' using errcode = 'P0001';
  end if;

  if v_meeting.is_thesis then
    raise exception '碩論週由管理員指定，無法認領' using errcode = 'P0001';
  end if;

  -- A past week is history, not an open slot. Claiming one also used to be
  -- a way to erase one's own seat on it: meetings_drop_presenter_questioner
  -- removes the new presenter from that week's questioners on any date.
  if v_meeting.scheduled_date < (now() at time zone 'Asia/Taipei')::date then
    raise exception '已經過去的週次無法認領' using errcode = 'P0001';
  end if;

  if v_meeting.presenter_user_id is not null then
    if v_meeting.presenter_user_id = v_uid then
      -- Idempotent: the same user claiming again is a no-op, not an error.
      return;
    end if;
    raise exception '此週已被其他人認領，請重新整理頁面' using errcode = 'P0001';
  end if;

  select coalesce(name, email) into v_name from public.user_profiles where id = v_uid;

  update public.meetings
  set presenter = coalesce(v_name, v_uid::text),
      presenter_user_id = v_uid
  where id = p_meeting_id;
end;
$$;

create or replace function public.meetings_swap(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.meetings;
  v_b public.meetings;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;
  if p_a = p_b then
    raise exception '不能與自己互換' using errcode = 'P0001';
  end if;

  -- Rebalance key BEFORE the row locks. See 20260914170716's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  -- lock both rows in a stable id order to avoid deadlocks under concurrent edits
  perform 1 from public.meetings where id = least(p_a, p_b) for update;
  perform 1 from public.meetings where id = greatest(p_a, p_b) for update;

  select * into v_a from public.meetings where id = p_a;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;
  select * into v_b from public.meetings where id = p_b;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;

  -- 同一個學期 = 同一個學期日期窗。比較起點就夠了，兩個窗不可能只有一端相同。
  if public.meeting_semester_start(v_a.scheduled_date)
     <> public.meeting_semester_start(v_b.scheduled_date) then
    raise exception '只能在同一學期內互換' using errcode = 'P0001';
  end if;
  if v_a.is_holiday or v_b.is_holiday then
    raise exception '假期週不可互換' using errcode = 'P0001';
  end if;
  if v_a.is_speaker or v_b.is_speaker then
    raise exception '演講週不可互換' using errcode = 'P0001';
  end if;
  if v_a.is_thesis or v_b.is_thesis then
    raise exception '碩論週不可互換' using errcode = 'P0001';
  end if;

  -- Defer the per-paper 365-day cooldown so the transient mid-swap state (both
  -- rows briefly sharing a paper) is only judged at commit, by which point the
  -- papers have fully traded and the final state is valid.
  set constraints public.meetings_paper_cooldown deferred;

  -- Clear the reading-list link on both rows first: meetings_presenter_paper_uniq
  -- is a partial index (can't be deferred), so we must never expose a duplicate
  -- (presenter, teacher_paper_id) pair mid-swap. The sync trigger clears the
  -- mirrored paper_title/paper_link too; the swap below re-sets everything.
  update public.meetings set teacher_paper_id = null where id in (p_a, p_b);

  -- Swap the whole presentation payload. Slot fields (scheduled_date /
  -- week_label / is_holiday / location / start_time) stay put, so questioners
  -- stay on the date. A questioner who is now presenting that week is dropped
  -- by meetings_drop_presenter_questioner, and the reconcile at COMMIT fills
  -- the gap and evens out the counts.
  update public.meetings set
    presenter = v_b.presenter, presenter_user_id = v_b.presenter_user_id,
    teacher_paper_id = v_b.teacher_paper_id,
    paper_title = v_b.paper_title, paper_link = v_b.paper_link,
    ppt_uploaded = v_b.ppt_uploaded, ppt_link = v_b.ppt_link,
    video_uploaded = v_b.video_uploaded, video_link = v_b.video_link,
    notes = v_b.notes
  where id = p_a;

  update public.meetings set
    presenter = v_a.presenter, presenter_user_id = v_a.presenter_user_id,
    teacher_paper_id = v_a.teacher_paper_id,
    paper_title = v_a.paper_title, paper_link = v_a.paper_link,
    ppt_uploaded = v_a.ppt_uploaded, ppt_link = v_a.ppt_link,
    video_uploaded = v_a.video_uploaded, video_link = v_a.video_link,
    notes = v_a.notes
  where id = p_b;
end;
$$;

create or replace function public.meetings_fill_presenters(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roster   uuid[];
  v_names    text[];
  v_size     int;
  v_excluded int;
  v_last_pos int;
  v_index    int := 0;
  v_meeting  record;
  v_filled   int := 0;
  v_updated  int;
  v_attempts int;
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可排定報告人' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_fill_presenters:' || p_year::text));

  select array_agg(p.user_id
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc),
         array_agg(coalesce(up.name, up.email, p.user_id::text)
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc)
  into v_roster, v_names
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where public.meetings_is_rotation_member(up.lab_status);

  select count(*)::int into v_excluded
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where not public.meetings_is_rotation_member(up.lab_status);

  v_size := coalesce(array_length(v_roster, 1), 0);
  if v_size = 0 then
    return jsonb_build_object('filled', 0, 'poolSize', 0, 'excluded', v_excluded);
  end if;

  select array_position(v_roster, m.presenter_user_id)
  into v_last_pos
  from public.meetings m
  where m.scheduled_date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
    and m.presenter_user_id is not null
    and not m.is_holiday
    and not m.is_speaker
    and not m.is_thesis
    and array_position(v_roster, m.presenter_user_id) is not null
  order by m.scheduled_date desc, m.id desc
  limit 1;

  v_index := coalesce(v_last_pos, 0);

  for v_meeting in
    select id
    from public.meetings
    where scheduled_date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
      and not is_holiday
      and not is_speaker
      and not is_thesis
      and presenter_user_id is null
      and presenter is null
      and scheduled_date >= v_today
    order by scheduled_date asc, id asc
  loop
    v_attempts := 0;

    loop
      begin
        update public.meetings
        set presenter = v_names[(v_index % v_size) + 1],
            presenter_user_id = v_roster[(v_index % v_size) + 1]
        where id = v_meeting.id
          and presenter_user_id is null
          and presenter is null;
        get diagnostics v_updated = row_count;
        exit;
      exception when unique_violation then
        v_index := v_index + 1;
        v_attempts := v_attempts + 1;
        if v_attempts >= v_size then
          v_updated := 0;
          exit;
        end if;
      end;
    end loop;

    if v_updated > 0 then
      v_index := v_index + 1;
      v_filled := v_filled + 1;
    end if;
  end loop;

  return jsonb_build_object('filled', v_filled, 'poolSize', v_size, 'excluded', v_excluded);
end;
$$;

-- #1153: take the rebalance key before the `for update` sweeps. The BEFORE
-- STATEMENT trigger would otherwise be the first taker, AFTER these functions
-- already hold the row locks.

create or replace function public.meetings_insert_week(p_at_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target   public.meetings;
  v_ids      uuid[];
  v_dates    date[];
  v_labels   text[];
  v_k        int;
  v_new_date date;
  v_new_label text;
  v_blank_id uuid;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能在假期週插入' using errcode = 'P0001'; end if;
  if v_target.is_speaker then raise exception '不能在演講週插入' using errcode = 'P0001'; end if;

  perform 1 from public.meetings
  where scheduled_date >= v_target.scheduled_date for update;

  set constraints public.meetings_paper_cooldown deferred;

  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_k := coalesce(array_length(v_ids, 1), 0);
  if v_k = 0 then return null; end if;

  v_new_date := public.meetings_next_free_date(v_dates[v_k] + 7);
  v_new_label := public.meetings_mint_week_label(v_new_date);

  for i in reverse v_k .. 1 loop
    if i = v_k then
      update public.meetings set scheduled_date = v_new_date, week_label = v_new_label
      where id = v_ids[i];
    else
      update public.meetings set scheduled_date = v_dates[i + 1], week_label = nullif(v_labels[i + 1], '')
      where id = v_ids[i];
    end if;
  end loop;

  insert into public.meetings (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values (nullif(v_labels[1], ''), v_dates[1], false, null, null)
  returning id into v_blank_id;

  return v_blank_id;
end;
$$;

create or replace function public.meetings_remove_week(p_at_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.meetings;
  v_ids    uuid[];
  v_dates  date[];
  v_labels text[];
  v_m      int;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能刪除假期週' using errcode = 'P0001'; end if;
  if v_target.is_speaker then raise exception '不能刪除演講週' using errcode = 'P0001'; end if;

  perform 1 from public.meetings
  where scheduled_date >= v_target.scheduled_date for update;

  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_m := coalesce(array_length(v_ids, 1), 0);

  set constraints public.meetings_paper_cooldown deferred;

  delete from public.meetings where id = v_ids[1];

  for i in 2 .. v_m loop
    update public.meetings set scheduled_date = v_dates[i - 1], week_label = nullif(v_labels[i - 1], '')
    where id = v_ids[i];
  end loop;
end;
$$;

create or replace function public.meetings_append_week(p_academic_year integer, p_term smallint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_max_date date;
  v_new_date date;
  v_new_id   uuid;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;
  if p_academic_year is null or p_term is null or p_term not in (1, 2) then
    raise exception '缺少學期' using errcode = 'P0001';
  end if;

  if p_term = 1 then
    v_from := make_date(p_academic_year + 1911, 8, 1);
    v_to   := make_date(p_academic_year + 1912, 1, 31);
  else
    v_from := make_date(p_academic_year + 1912, 2, 1);
    v_to   := make_date(p_academic_year + 1912, 7, 31);
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));
  perform pg_advisory_xact_lock(hashtext('meetings_append_week:' || v_from::text));

  perform 1 from public.meetings
  where scheduled_date between v_from and v_to for update;

  select max(scheduled_date) into v_max_date
  from public.meetings
  where scheduled_date between v_from and v_to;

  if v_max_date is null then
    raise exception '此學期還沒有任何週次，無法接續新增' using errcode = 'P0001';
  end if;

  v_new_date := public.meetings_next_free_date(v_max_date + 7);

  if v_new_date > v_to then
    raise exception '此學期已經排到最後一天 %，下一個空位落在下學期，請改對下學期呼叫 append_week',
      v_to
      using errcode = 'P0001';
  end if;

  insert into public.meetings
    (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values
    (public.meetings_mint_week_label(v_new_date), v_new_date, false, null, null)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ── 11. the old engine ─────────────────────────────────────────────────────

drop function if exists public.meetings_rebalance_questioners_exec(boolean);
