-- Rewrite the questioner roster for every week after the next one, by rate.
--
-- WHY THIS EXISTS AT ALL. meetings_sync_questioners only ever tops a week up to
-- three; it never reshuffles. So a member who joins in September cannot reach a
-- schedule that was filled in August — the slots are already occupied, and
-- nothing revisits them. On 2026-09-14 that left five members on zero while one
-- held seven of the seventeen remaining weeks. Widening the candidate pool
-- (20260825120000) did nothing for the same reason. Something has to be allowed
-- to take assignments away again, and this is it.
--
-- WHAT IS FROZEN. The nearest upcoming meeting keeps its roster: it has been
-- announced and those three people are preparing. Everything after it is fair
-- game. Holidays are rows but not meetings, so the freeze line skips them.
--
-- WHAT SURVIVES. source = 'manual' rows are kept wherever they are — an admin
-- put them there on purpose. They still count towards their member's rate, so
-- a manual assignment reduces how much automatic duty that person draws.
--
-- WHY THE DENOMINATOR IS SNAPSHOTTED. Step one deletes the auto rows in range,
-- which momentarily leaves those weeks with no questioners at all — and the
-- rate's denominator is "weeks that have questioners". Left to follow the data
-- it would collapse mid-run. So the week set is fixed up front as
-- (weeks that already have questioners) ∪ (weeks in range), computed before
-- anything is deleted.
--
-- NON-ROTATION MEMBERS ARE EXCLUDED FROM THE PICK. This is load-bearing, not
-- defensive: a 校友 stops being assigned, so their numerator stops growing while
-- everyone else's rises, and they converge on the lowest rate in the table —
-- exactly what this function searches for. A fairness pass without this filter
-- would preferentially hand the roster to people who have left the lab.
--
-- WHERE THE AUTHORIZATION LIVES. Not here. This is the engine: it carries no
-- permission check and is callable only by the wrapper below and by the pool
-- trigger, both of which are the only things granted EXECUTE on it.
--
-- The implementation plan put an `auth.uid() is not null and not
-- is_meetings_admin()` check inside the engine and had the trigger call it
-- directly. That conflates two different questions. Writing to a pool table is
-- a privileged act, and RLS already answers it; rebalancing is the CONSEQUENCE
-- of a write that has already been authorized, so re-asking there can only
-- produce false negatives. It did, immediately: a superuser DELETE running with
-- a non-admin JWT still in request.jwt.claims — which `reset role` does not
-- clear — aborted with "Forbidden" on a statement RLS had every right to allow.
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

  select min(scheduled_date) into v_freeze
  from public.meetings
  where scheduled_date >= v_today and not is_holiday;

  if v_freeze is null then
    return jsonb_build_object(
      'dryRun', p_dry_run, 'frozenDate', null,
      'weeks', 0, 'assigned', 0, 'roster', '[]'::jsonb
    );
  end if;

  -- Dropped explicitly rather than relying on ON COMMIT DROP: the pool triggers
  -- can call this twice inside one transaction, and the second call would hit a
  -- table that is still there.
  drop table if exists rebalance_scope;
  drop table if exists rebalance_planned;
  drop table if exists rebalance_state;

  create temporary table rebalance_scope on commit drop as
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where m.scheduled_date > v_freeze
    and not m.is_holiday
    and not m.is_speaker
    and m.presenter_user_id is not null;

  create temporary table rebalance_planned on commit drop as
  select mq.meeting_id, mq.user_id, mq.source
  from public.meeting_questioners mq
  join rebalance_scope s on s.id = mq.meeting_id
  where mq.source = 'manual';

  create temporary table rebalance_state on commit drop as
  with pool as (
    select user_id, min(created_at)::date as pool_added_at
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
    where exists (
      select 1 from public.meeting_questioners q where q.meeting_id = m.id
    )
    union
    select s.id, s.scheduled_date, s.presenter_user_id from rebalance_scope s
  )
  select
    p.user_id,
    p.pool_added_at,
    (select count(*)::int from weeks w
      where w.scheduled_date >= p.pool_added_at
        and (w.presenter_user_id is null or w.presenter_user_id <> p.user_id)
    ) as den,
    -- Everything that will still be there after the delete: assignments outside
    -- the range, plus the manual ones inside it.
    (select count(*)::int
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = p.user_id
        and m.scheduled_date >= p.pool_added_at
        and (mq.source = 'manual'
             or not exists (select 1 from rebalance_scope s where s.id = mq.meeting_id))
    ) as num,
    (select max(m.scheduled_date)
       from public.meeting_questioners mq
       join public.meetings m on m.id = mq.meeting_id
      where mq.user_id = p.user_id
        and m.scheduled_date <= v_today
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

      -- The roster as it will stand once this run is written: real rows for
      -- everything outside the range, planned rows for everything inside it.
      -- The co-pairing tie-break has to read both, or it would score candidates
      -- against the rosters this very function is in the middle of replacing.
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
        and v_meeting.scheduled_date >= st.pool_added_at
        and not exists (
          select 1 from rebalance_planned pl
          where pl.meeting_id = v_meeting.id and pl.user_id = st.user_id
        )
      order by (case when st.den = 0 then 0::numeric
                     else st.num::numeric / st.den end) asc,
               (select count(distinct pl.user_id)
                  from rebalance_planned pl
                  join paired pr
                    on pr.a = st.user_id and pr.b = pl.user_id
                 where pl.meeting_id = v_meeting.id) asc,
               st.last_asked_date asc nulls first,
               st.pool_added_at asc,
               st.user_id asc
      limit 1;

      -- Nobody left: the pool is smaller than three eligible people for this
      -- week. The slot stays open, same as the backfill's behaviour.
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

-- The engine is not part of the API surface. `revoke ... from public` alone is
-- not enough: Supabase's default privileges grant EXECUTE to anon,
-- authenticated and service_role DIRECTLY on every new function, and revoking
-- from PUBLIC does not touch a direct grant (20260825120000's note). Revoke all
-- three by name; the wrapper and the trigger are SECURITY DEFINER and reach it
-- as the owner.
revoke all on function public.meetings_rebalance_questioners_exec(boolean)
  from public, anon, authenticated, service_role;

-- The API surface. Admin-only, with the carve-out for a null auth.uid() — a
-- migration or a service_role sweep has no JWT to satisfy the check with, the
-- same exemption meetings_guard_columns makes.
create or replace function public.meetings_rebalance_questioners(
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可重新平衡提問人' using errcode = '42501';
  end if;

  return public.meetings_rebalance_questioners_exec(p_dry_run);
end;
$function$;

revoke all on function public.meetings_rebalance_questioners(boolean) from public, anon;
grant execute on function public.meetings_rebalance_questioners(boolean) to authenticated, service_role;
