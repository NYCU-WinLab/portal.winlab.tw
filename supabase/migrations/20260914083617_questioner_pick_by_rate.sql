-- Pick questioners by rate, and break rate ties by who has NOT recently sat in
-- the same week as the people already on this week's roster.
--
-- Both functions below are redeclared whole from 20260831140200 — the version
-- actually running in prod, NOT the 20260825120xxx pair the implementation plan
-- names. That plan was written on 2026-08-30, one day before 20260831140200
-- landed, so copying its baseline would silently delete two things that
-- migration added: the backfill's `and r.is_active` filter, and the lab_status
-- clause in the future-only eviction. Losing them puts 校友 / 老師 back into the
-- rotation, which is precisely the compound failure the design document warned
-- about in §9.1 ②: a non-member stops accruing assignments, so their rate sinks
-- to the bottom, and a fairness pass that hunts for the lowest rate hands the
-- next slot to someone who has left.
--
-- THE ONLY INTENDED CHANGES ARE THE TWO ORDER BY CLAUSES, plus one consistency
-- fix noted at its site (current_date → Asia/Taipei, so the function and
-- meeting_questioner_stats cannot disagree about what day it is during the
-- eight hours a Taipei morning is still "yesterday" in UTC).

-- WHY A SECOND SORT KEY AT ALL.
--
-- Rate alone makes the COUNTS fair and leaves the COMBINATIONS clumped: members
-- with equal rate also have equal denominators, so they move through the
-- ordering in lockstep and keep landing in the same week as each other. On the
-- 2026-09-14 schedule that produced four trios that recurred across nine weeks,
-- with the new members always drawn together and the long-standing ones always
-- drawn together.
--
-- This counts, for a candidate, how many of the week's existing questioners
-- they have already shared a staffed week with in the preceding 56 days. It is
-- only ever a TIE-BREAK — rate stays the leading key — so the distribution of
-- how much work each person does is bit-for-bit unchanged; only who sits with
-- whom moves. Measured on the same schedule: recurring trios 4 → 1, distinct
-- pairings 33 → 42, rate spread identical at 0.154–0.200.
--
-- 56 days rather than a count of weeks: holidays make "the last N meetings" and
-- "the last N weeks" different, and the thing being avoided is social ("we were
-- just on together"), which people measure in calendar time.
create or replace function public.meetings_recent_copair_count(
  p_user uuid,
  p_meeting_id uuid
)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select count(*)::int
  from public.meetings m
  join public.meeting_questioners cur on cur.meeting_id = m.id
  where m.id = p_meeting_id
    and cur.user_id <> p_user
    and exists (
      select 1
      from public.meeting_questioners a
      join public.meeting_questioners b on b.meeting_id = a.meeting_id
      join public.meetings prev on prev.id = a.meeting_id
      where a.user_id = p_user
        and b.user_id = cur.user_id
        and prev.id <> p_meeting_id
        and prev.scheduled_date < m.scheduled_date
        and prev.scheduled_date >= m.scheduled_date - interval '56 days'
    );
$function$;

revoke all on function public.meetings_recent_copair_count(uuid, uuid) from public, anon;
grant execute on function public.meetings_recent_copair_count(uuid, uuid) to authenticated, service_role;

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

  -- Future meetings only: a questioner who has since left BOTH pools, or whom
  -- Keycloak now places outside the rotation, is no longer a valid pick — evict
  -- them so the backfill refills from the current union. NULL lab_status is
  -- deliberately NOT an eviction reason; see 20260831140200's header.
  -- Past meetings are left untouched (their roster is history).
  --
  -- v_today rather than current_date: the session runs in UTC, so current_date
  -- calls a Taipei morning "yesterday" for eight hours, and this function would
  -- then disagree with meeting_questioner_stats about which side of today a
  -- meeting falls on.
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

  select count(*) into v_current_count
  from public.meeting_questioners
  where meeting_id = p_meeting_id;

  v_missing := 3 - v_current_count;

  -- One at a time, not `limit v_missing`: the co-pairing tie-break depends on
  -- who is already on the roster, so each pick has to see the previous one.
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

    -- Pool exhausted: no candidate left for this week. The slot stays open,
    -- which is what the old `limit v_missing` did too.
    exit when not found;
    v_missing := v_missing - 1;
  end loop;
end;
$function$;

revoke all on function public.meetings_sync_questioners(uuid) from public, anon;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;

-- Redeclared whole from 20260831140200. The ONLY change is the auto-pick
-- ORDER BY, kept identical to meetings_sync_questioners' so a manual removal
-- and an automatic top-up never disagree about who is next.
create or replace function public.meetings_replace_questioner(
  p_meeting_id uuid,
  p_remove_user uuid,
  p_replacement uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meeting public.meetings;
  v_next    uuid;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可操作提問小組' using errcode = '42501';
  end if;

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
    if not exists (
      select 1 from public.meeting_question_pool where user_id = p_replacement
      union
      select 1 from public.meeting_presenter_pool where user_id = p_replacement
    ) then
      raise exception '替補人選不在提問成員池中' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.user_profiles up
      where up.id = p_replacement
        and up.lab_status is not null
        and not public.meetings_is_rotation_member(up.lab_status)
    ) then
      raise exception '替補人選不在提問輪替範圍(僅限碩士生與博士生)'
        using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.meeting_questioners
      where meeting_id = p_meeting_id and user_id = p_replacement
    ) then
      raise exception '替補人選已經是本週提問小組成員' using errcode = 'P0001';
    end if;
  end if;

  delete from public.meeting_questioners
  where meeting_id = p_meeting_id and user_id = p_remove_user;

  if p_replacement is null then
    -- Auto-pick: deterministic next-in-rotation candidate, excluding the
    -- presenter, the just-removed member, anyone already assigned, and anyone
    -- no longer in the lab. May find nobody (pool exhausted) — that's fine, the
    -- slot stays open.
    select r.user_id into v_next
    from public.meeting_question_rotation r
    where r.user_id <> p_remove_user
      and r.is_active
      and (v_meeting.presenter_user_id is null or r.user_id <> v_meeting.presenter_user_id)
      and not exists (
        select 1 from public.meeting_questioners mq
        where mq.meeting_id = p_meeting_id and mq.user_id = r.user_id
      )
    order by r.rate asc,
             public.meetings_recent_copair_count(r.user_id, p_meeting_id) asc,
             r.last_asked_date asc nulls first,
             r.pool_added_at asc,
             r.user_id asc
    limit 1;
    p_replacement := v_next;
  end if;

  if p_replacement is not null then
    insert into public.meeting_questioners (meeting_id, user_id, source)
    values (p_meeting_id, p_replacement, 'manual')
    on conflict (meeting_id, user_id) do nothing;
  end if;
end;
$function$;

revoke all on function public.meetings_replace_questioner(uuid, uuid, uuid) from public, anon;
grant execute on function public.meetings_replace_questioner(uuid, uuid, uuid) to authenticated;
