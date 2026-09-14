-- Review fixes for the fairness work (20260914083508 … 20260914084840).
--
-- Everything here is a NEW migration rather than an edit to those seven files:
-- all of them are already applied to prod, and this project has twice been bitten
-- by a repo file that no longer says what actually ran (#410, #344/#347).
--
-- One correction that cannot be made in place, recorded here instead:
-- 20260914084840's header claims meeting_presenter_pool "was seeded in one
-- statement on 2026-08-08 by 20260807000000". It was not — that migration's only
-- insert sits inside meetings_pool_upsert's body. The fourteen prod rows were
-- written between 10:36 and 10:42 that morning, six minutes apart, i.e. by hand
-- through the admin panel. The migration's conclusion is unaffected and rests on
-- better evidence anyway: nine of those fourteen had already presented during the
-- spring semester, so 2026-08-08 cannot be when they joined.

-- ── 1. meeting_questioner_stats ────────────────────────────────────────────
--
-- Two fixes, both about which weeks count.
--
-- (a) `staffed` now excludes holidays. A week flagged is_holiday AFTER its
--     questioners were assigned keeps those rows until something calls
--     meetings_sync_questioners on it, and until then it inflates everyone's
--     denominator. The old spelling relied on "a holiday week never has
--     questioner rows" being maintained by convention rather than by the schema.
--
-- (b) pool_added_at is compared in Asia/Taipei, not in the session timezone.
--     Every "today" in this feature is already pinned to Taipei; the lower bound
--     was the one end still resolving against whatever TimeZone the session
--     happened to carry. A member added at 02:00 Taipei reads as the previous
--     calendar day in a UTC session, which charges them for a meeting that had
--     already happened without them.
--
-- The pool_added_at COLUMN stays timestamptz — create or replace view cannot
-- retype a column, and callers order by it.
create or replace view public.meeting_questioner_stats
with (security_invoker = true) as
with pool as (
  select user_id, min(created_at) as pool_added_at
  from (
    select user_id, created_at from public.meeting_question_pool
    union all
    select user_id, created_at from public.meeting_presenter_pool
  ) s
  group by user_id
),
staffed as (
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where not m.is_holiday
    and exists (
      select 1 from public.meeting_questioners q where q.meeting_id = m.id
    )
)
select
  p.user_id,
  p.pool_added_at,
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
from pool p
left join lateral (
  select count(*)::int as opportunities
  from staffed s
  where s.scheduled_date >= (p.pool_added_at at time zone 'Asia/Taipei')::date
    and (s.presenter_user_id is null or s.presenter_user_id <> p.user_id)
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
    and m.scheduled_date >= (p.pool_added_at at time zone 'Asia/Taipei')::date
) a on true;

-- anon is dropped. The other three views in this family are safe for anon
-- because they select up.email, and 20260724082722 narrowed anon's
-- user_profiles access to (id, name) — with security_invoker that is a column
-- privilege failure before any row is considered. This view touches no
-- user_profiles column at all, so nothing but the pool tables' RLS stands
-- between anon and every member's participation history. That returns zero rows
-- today (neither pool has an anon policy), but it is the only thing doing so,
-- and both pool tables still carry blanket DML grants to anon.
revoke select on public.meeting_questioner_stats from anon;
grant select on public.meeting_questioner_stats to authenticated, service_role;

-- ── 2. meetings_sync_questioners: never staff a week that has happened ─────
--
-- Redeclared from 20260914083617. The eviction half was already guarded by
-- `scheduled_date > v_today`; the BACKFILL was not, and that is the hole.
--
-- This function is SECURITY DEFINER, granted to authenticated, and carries no
-- authorization check of its own (it predates this work and meetings_claim
-- depends on calling it as an ordinary member). So any signed-in user could post
-- a past meeting id and have three questioners written into it — history that
-- never happened.
--
-- That is not hypothetical. 20260914084840's header documents eighteen such rows
-- back-filled into six January-2026 weeks, with assigned_at in July and August.
-- The fairness work makes it worse than untidy: fabricated rows feed times_asked
-- and the rate numerator, and flip the target week into the `staffed` set, which
-- moves every member's denominator.
--
-- A past week's roster is history, not a plan. Nothing should write it — the
-- same principle the eviction clause already follows one screen up.
create or replace function public.meetings_sync_questioners(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meeting        public.meetings;
  v_current_count  int;
  v_missing        int;
  v_today          date := (now() at time zone 'Asia/Taipei')::date;
begin
  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    return;
  end if;

  if v_meeting.is_holiday or v_meeting.presenter_user_id is null then
    delete from public.meeting_questioners where meeting_id = p_meeting_id;
    return;
  end if;

  delete from public.meeting_questioners
  where meeting_id = p_meeting_id and user_id = v_meeting.presenter_user_id;

  if v_meeting.scheduled_date > v_today then
    delete from public.meeting_questioners mq
    where mq.meeting_id = p_meeting_id
      and (
        not exists (
          select 1 from public.meeting_question_pool p where p.user_id = mq.user_id
          union
          select 1 from public.meeting_presenter_pool pp where pp.user_id = mq.user_id
        )
        or exists (
          select 1 from public.user_profiles up
          where up.id = mq.user_id
            and up.lab_status is not null
            and not public.meetings_is_rotation_member(up.lab_status)
        )
      );
  end if;

  -- THE FIX. An ordinary member cannot cause a past week to be staffed.
  --
  -- Deliberately narrower than "nobody may": an admin repairing a week that was
  -- mis-flagged, and a migration or service_role sweep (auth.uid() is null),
  -- keep the ability. What is removed is the one thing no signed-in member
  -- should hold — writing questioner history for a meeting that has already
  -- happened, which now also moves everyone else's rate denominator.
  --
  -- This does NOT make the January-2026 artefacts impossible to repeat: those
  -- six weeks were labelled 寒假 but never flagged is_holiday, so they look like
  -- ordinary meetings to every code path here, and an admin action would still
  -- staff them. Flagging them is a data fix, tracked separately — this is the
  -- authorization half only.
  if v_meeting.scheduled_date < v_today
     and auth.uid() is not null
     and not public.is_meetings_admin() then
    return;
  end if;

  select count(*) into v_current_count
  from public.meeting_questioners
  where meeting_id = p_meeting_id;

  v_missing := 3 - v_current_count;

  while v_missing > 0 loop
    insert into public.meeting_questioners (meeting_id, user_id, source)
    select p_meeting_id, r.user_id, 'auto'
    from public.meeting_question_rotation r
    where r.user_id <> v_meeting.presenter_user_id
      and r.is_active
      and not exists (
        select 1 from public.meeting_questioners mq
        where mq.meeting_id = p_meeting_id and mq.user_id = r.user_id
      )
    order by r.rate asc,
             public.meetings_recent_copair_count(r.user_id, p_meeting_id) asc,
             r.last_asked_date asc nulls first,
             r.pool_added_at asc,
             r.user_id asc
    limit 1
    on conflict (meeting_id, user_id) do nothing;

    exit when not found;
    v_missing := v_missing - 1;
  end loop;
end;
$function$;

revoke all on function public.meetings_sync_questioners(uuid) from public, anon;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;

-- ── 3. meetings_rebalance_questioners_exec ─────────────────────────────────
--
-- Four fixes. Redeclared from 20260914083707; everything not listed is byte-
-- identical.
--
-- (a) A MEMBER WHOSE lab_status IS NULL IS NO LONGER TORN OUT OF THE SCHEDULE.
--     This was the review's most serious finding and it reverses a policy the
--     codebase states twice — 20260831140000's header and, in this very feature,
--     meetings_sync_questioners' eviction clause, which is deliberately narrowed
--     to `lab_status is not null and not meetings_is_rotation_member(...)`:
--
--       "Evicting on NULL would make that rename destructive and irreversible:
--        the member is torn out of every future week, and when their status
--        comes back at their next login nothing puts the weeks back."
--
--     The engine did exactly that, by a different route: it deletes every auto
--     row in range and repicks from a candidate set filtered on
--     meetings_is_rotation_member(lab_status), which is `coalesce(... , false)`
--     — NULL excluded. Delete-then-repick turns "not picked for new slots" into
--     eviction from everything.
--
--     NULL is routine, not exotic: it is what the nightly Keycloak sync writes
--     the morning after a member renames themselves, because the lookup matches
--     on a username the portal only refreshes at login. And since the pool
--     trigger fires on any membership change, one such member plus one admin
--     adding one person was enough.
--
--     Fixed by seeding rebalance_planned with their existing auto rows, the same
--     way manual rows are preserved. They keep what they hold and accrue nothing
--     new — which is the three-state rule as written.
--
-- (b) THE FREEZE LINE NOW MATCHES THE SCOPE. It filtered only is_holiday while
--     the scope also requires `not is_speaker and presenter_user_id is not null`.
--     So when the nearest upcoming meeting was a speaker week or had no
--     presenter yet, the freeze was spent on a week with no roster to protect,
--     and the first week that DID have an announced roster fell inside the range
--     and was rewritten — breaking this function's own stated contract that
--     "the nearest upcoming meeting keeps its roster".
--
-- (c) last_asked_date IS BOUNDED BY pool_added_at, matching
--     meeting_questioner_stats. Without it the third sort key differed between
--     this picker and the other two, and it read precisely the pre-cutoff rows
--     that 20260914084840 asserts nothing reads any more.
--
-- (d) pool_added_at is resolved in Asia/Taipei and kept at full precision
--     (::date truncation lost the fourth sort key's tie-break), and the temp
--     table drops are schema-qualified to pg_temp so a SECURITY DEFINER function
--     can never drop a public table of the same name.
create or replace function public.meetings_rebalance_questioners_exec(
  p_dry_run boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
  v_freeze   date;
  v_meeting  record;
  v_pick     uuid;
  v_slots    int;
  v_weeks    int := 0;
  v_assigned int := 0;
  v_roster   jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  -- Same predicate as rebalance_scope below, minus the date comparison.
  select min(scheduled_date) into v_freeze
  from public.meetings
  where scheduled_date >= v_today
    and not is_holiday
    and not is_speaker
    and presenter_user_id is not null;

  if v_freeze is null then
    return jsonb_build_object(
      'dryRun', p_dry_run, 'frozenDate', null,
      'weeks', 0, 'assigned', 0, 'roster', '[]'::jsonb
    );
  end if;

  drop table if exists pg_temp.rebalance_scope;
  drop table if exists pg_temp.rebalance_planned;
  drop table if exists pg_temp.rebalance_state;

  create temporary table rebalance_scope on commit drop as
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where m.scheduled_date > v_freeze
    and not m.is_holiday
    and not m.is_speaker
    and m.presenter_user_id is not null;

  -- Manual rows, plus the auto rows of members Keycloak currently has no opinion
  -- about. Both are frozen in place for the same reason: the rebalance is
  -- entitled to reassign work, not to erase someone from a schedule because a
  -- sync has not caught up with them.
  create temporary table rebalance_planned on commit drop as
  select mq.meeting_id, mq.user_id, mq.source
  from public.meeting_questioners mq
  join rebalance_scope s on s.id = mq.meeting_id
  where mq.source = 'manual'
     or exists (
       select 1 from public.user_profiles up
       where up.id = mq.user_id and up.lab_status is null
     );

  create temporary table rebalance_state on commit drop as
  with pool as (
    select user_id, min(created_at) as pool_added_at
    from (
      select user_id, created_at from public.meeting_question_pool
      union all
      select user_id, created_at from public.meeting_presenter_pool
    ) s
    group by user_id
  ),
  weeks as (
    select m.id, m.scheduled_date, m.presenter_user_id
    from public.meetings m
    where not m.is_holiday
      and exists (
        select 1 from public.meeting_questioners q where q.meeting_id = m.id
      )
    union
    select s.id, s.scheduled_date, s.presenter_user_id from rebalance_scope s
  )
  select
    p.user_id,
    p.pool_added_at,
    (p.pool_added_at at time zone 'Asia/Taipei')::date as pool_added_on,
    (select count(*)::int from weeks w
      where w.scheduled_date >= (p.pool_added_at at time zone 'Asia/Taipei')::date
        and (w.presenter_user_id is null or w.presenter_user_id <> p.user_id)
    ) as den,
    (select count(*)::int
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = p.user_id
        and m.scheduled_date >= (p.pool_added_at at time zone 'Asia/Taipei')::date
        and (mq.source = 'manual'
             or not exists (select 1 from rebalance_scope s where s.id = mq.meeting_id))
    ) as num,
    (select max(m.scheduled_date)
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = p.user_id
        and m.scheduled_date <= v_today
        and m.scheduled_date >= (p.pool_added_at at time zone 'Asia/Taipei')::date
    ) as last_asked_date
  from pool p
  join public.user_profiles up on up.id = p.user_id
  where public.meetings_is_rotation_member(up.lab_status);

  for v_meeting in
    select id, scheduled_date, presenter_user_id
    from rebalance_scope
    order by scheduled_date asc, id asc
  loop
    v_weeks := v_weeks + 1;

    loop
      select count(*)::int into v_slots
      from rebalance_planned where meeting_id = v_meeting.id;
      exit when v_slots >= 3;

      with roster as (
        select mq.user_id, m.scheduled_date
        from public.meeting_questioners mq
        join public.meetings m on m.id = mq.meeting_id
        where not exists (select 1 from rebalance_scope s where s.id = mq.meeting_id)
        union all
        select pl.user_id, s.scheduled_date
        from rebalance_planned pl
        join rebalance_scope s on s.id = pl.meeting_id
      ),
      paired as (
        select r1.user_id as a, r2.user_id as b, r1.scheduled_date
        from roster r1
        join roster r2
          on r2.scheduled_date = r1.scheduled_date and r2.user_id <> r1.user_id
        where r1.scheduled_date < v_meeting.scheduled_date
          and r1.scheduled_date >= v_meeting.scheduled_date - interval '56 days'
      )
      select st.user_id into v_pick
      from rebalance_state st
      where st.user_id <> v_meeting.presenter_user_id
        and v_meeting.scheduled_date >= st.pool_added_on
        and not exists (
          select 1 from rebalance_planned pl
          where pl.meeting_id = v_meeting.id and pl.user_id = st.user_id
        )
      order by (case when st.den = 0 then 0::numeric
                     else round(st.num::numeric / st.den, 6) end) asc,
               (select count(distinct pl.user_id)
                  from rebalance_planned pl
                  join paired pr
                    on pr.a = st.user_id and pr.b = pl.user_id
                 where pl.meeting_id = v_meeting.id) asc,
               st.last_asked_date asc nulls first,
               st.pool_added_at asc,
               st.user_id asc
      limit 1;

      exit when v_pick is null;

      insert into rebalance_planned (meeting_id, user_id, source)
      values (v_meeting.id, v_pick, 'auto');
      update rebalance_state set num = num + 1 where user_id = v_pick;
      v_assigned := v_assigned + 1;
    end loop;
  end loop;

  if not p_dry_run then
    delete from public.meeting_questioners mq
    using rebalance_scope s
    where mq.meeting_id = s.id and mq.source = 'auto';

    insert into public.meeting_questioners (meeting_id, user_id, source)
    select pl.meeting_id, pl.user_id, pl.source
    from rebalance_planned pl
    on conflict (meeting_id, user_id) do nothing;
  end if;

  select coalesce(jsonb_agg(entry order by entry->>'date'), '[]'::jsonb)
  into v_roster
  from (
    select jsonb_build_object(
      'meetingId', s.id,
      'date', s.scheduled_date,
      'questioners', coalesce((
        select jsonb_agg(coalesce(up.name, up.email, pl.user_id::text)
                         order by coalesce(up.name, up.email, pl.user_id::text))
        from rebalance_planned pl
        join public.user_profiles up on up.id = pl.user_id
        where pl.meeting_id = s.id
      ), '[]'::jsonb)
    ) as entry
    from rebalance_scope s
  ) t;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'frozenDate', v_freeze,
    'weeks', v_weeks,
    'assigned', v_assigned,
    'roster', v_roster
  );
end;
$function$;

revoke all on function public.meetings_rebalance_questioners_exec(boolean)
  from public, anon, authenticated, service_role;

-- ── 4. meetings_pool_upsert: move a cohort without restarting anyone's clock ─
--
-- Redeclared from 20260807000000. The cohort-change branch was delete-then-
-- insert, which since 20260914083733 has two consequences it never had before:
--
--   * both statements are trigger events, so correcting one person's admission
--     year rewrites every future questioner roster twice; and
--   * the insert takes `created_at default now()`, so pool_added_at resets to
--     today and that member's entire questioning history drops out of BOTH
--     halves of the fairness rate. A clerical correction silently made them
--     look like a brand-new member.
--
-- An UPDATE fixes both at once: it preserves created_at by construction, and
-- UPDATE is deliberately not a trigger event (the pool's sort_order is not who
-- is eligible to question). Everything else — the admin check, the validation,
-- the advisory lock, the compaction of the vacated cohort — is unchanged.
create or replace function public.meetings_pool_upsert(
  p_user uuid,
  p_admission_year integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_year integer;
  v_in_pool  boolean;
  v_next     integer;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理報告順位' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_profiles where id = p_user) then
    raise exception '找不到此使用者' using errcode = 'P0001';
  end if;

  if p_admission_year is null or p_admission_year not between 90 and 200 then
    raise exception '入學學年須為民國年三碼（例如 113）' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('meetings_presenter_pool:' || p_admission_year::text)
  );

  select admission_year into v_old_year
  from public.meeting_presenter_pool
  where user_id = p_user;
  v_in_pool := found;

  if v_in_pool and v_old_year = p_admission_year then
    return;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
  from public.meeting_presenter_pool
  where admission_year = p_admission_year;

  if v_in_pool then
    -- Move, not re-create. See the header.
    update public.meeting_presenter_pool
    set admission_year = p_admission_year, sort_order = v_next
    where user_id = p_user;
    perform public.meetings_pool_compact(v_old_year);
  else
    insert into public.meeting_presenter_pool (user_id, admission_year, sort_order)
    values (p_user, p_admission_year, v_next);
  end if;
end;
$function$;

revoke all on function public.meetings_pool_upsert(uuid, integer) from public, anon;
grant execute on function public.meetings_pool_upsert(uuid, integer) to authenticated;
