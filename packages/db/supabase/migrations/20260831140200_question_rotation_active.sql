-- Keep people who have left the lab out of the questioner rotation.
--
-- THE DIVISION OF LABOUR HERE IS DELIBERATE: the views DESCRIBE, the functions
-- DECIDE.
--
-- The obvious move is to add `where meetings_is_active_member(...)` to
-- meeting_question_pool_members and be done. Don't. That view backs the
-- "額外提問成員" admin panel, and filtering it would make a graduated member
-- invisible in the one place an admin could remove them — trading a roster that
-- schedules the wrong people for a table nobody can clean up. The silent
-- disappearance just moves.
--
-- So both views gain an `is_active` column and keep every row, and the three
-- places that actually choose someone read that column. A panel can then show
-- an inactive member greyed out with a reason, which is what
-- presenter-pool-panel does.

-- Appended, not inserted. `create or replace view` cannot rename or reorder an
-- existing column; is_active is column 7 and the fairness work landing after
-- this appends from column 8 on.
create or replace view public.meeting_question_rotation
with (security_invoker = true) as
with pool as (
  select user_id, min(created_at) as pool_added_at
  from (
    select user_id, created_at from public.meeting_question_pool
    union all
    select user_id, created_at from public.meeting_presenter_pool
  ) s
  group by user_id
)
select
  pool.user_id,
  up.name,
  up.email,
  pool.pool_added_at,
  stats.last_asked_date,
  coalesce(stats.times_asked, 0) as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active
from pool
join public.user_profiles up on up.id = pool.user_id
left join (
  select
    mq.user_id,
    max(m.scheduled_date) as last_asked_date,
    count(*) as times_asked
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  group by mq.user_id
) stats on stats.user_id = pool.user_id
order by stats.last_asked_date asc nulls first, pool.pool_added_at asc, pool.user_id asc;

grant select on public.meeting_question_rotation to anon, authenticated, service_role;

-- Same column, same position, same reason. Still the narrow
-- meeting_question_pool-only membership (see 20260825120001:66).
create or replace view public.meeting_question_pool_members
with (security_invoker = true) as
select
  p.user_id,
  up.name,
  up.email,
  p.created_at as pool_added_at,
  stats.last_asked_date,
  coalesce(stats.times_asked, 0) as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active
from public.meeting_question_pool p
join public.user_profiles up on up.id = p.user_id
left join (
  select
    mq.user_id,
    max(m.scheduled_date) as last_asked_date,
    count(*) as times_asked
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  group by mq.user_id
) stats on stats.user_id = p.user_id
order by stats.last_asked_date asc nulls first, p.created_at asc, p.user_id asc;

grant select on public.meeting_question_pool_members to anon, authenticated, service_role;

-- Redeclared whole from 20260825120001:9. Two changes:
--
--   1. The future-only eviction now also drops a questioner who is no longer an
--      active member. It used to check pool membership alone, which says
--      nothing about whether the person still attends — a graduated member
--      stays in meeting_presenter_pool until an admin removes them by hand.
--
--   2. The backfill only considers active candidates.
--
-- EVICTION IS NARROWER THAN THE BACKFILL, ON PURPOSE.
--
-- The backfill picks only rotation members (碩士生/博士生). Eviction removes
-- only those Keycloak has POSITIVELY placed somewhere else — 老師, 助理,
-- 大學部, 校友. NULL is left alone.
--
-- The asymmetry is about what each value claims. A known non-grad status is a
-- statement about a person. NULL means Keycloak had nothing to say — which is
-- also what a member gets the morning after renaming themselves in Keycloak,
-- since the sync matches on a username the portal only refreshes at login.
--
-- Evicting on NULL would make that rename destructive and irreversible: the
-- member is torn out of every future week, and when their status comes back at
-- their next login nothing puts the weeks back. Declining to pick them for NEW
-- slots costs nothing and reverses itself. So a NULL member keeps what they
-- already hold and simply stops accruing more — the mildest reading of
-- "excluded" that still does the job.
--
-- NOTE THIS IS A BEHAVIOUR CHANGE TO ALREADY-SCHEDULED WEEKS. The next thing
-- that resyncs a future meeting — changing its presenter, most commonly — will
-- now evict non-rotation questioners from it and pull in replacements. That is
-- the intent (it is half of "a schedule written before someone graduated never
-- gets revisited"), but it means a week's roster can change without anyone
-- touching that week.
--
-- Past meetings stay untouched, as before: their roster is history, not a plan.
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
  -- deliberately NOT an eviction reason; see the header.
  -- Past meetings are left untouched (their roster is history).
  if v_meeting.scheduled_date > current_date then
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
  if v_missing > 0 then
    insert into public.meeting_questioners (meeting_id, user_id, source)
    select p_meeting_id, r.user_id, 'auto'
    from public.meeting_question_rotation r
    where r.user_id <> v_meeting.presenter_user_id
      and r.is_active
      and not exists (
        select 1 from public.meeting_questioners mq
        where mq.meeting_id = p_meeting_id and mq.user_id = r.user_id
      )
    order by r.last_asked_date asc nulls first, r.pool_added_at asc, r.user_id asc
    limit v_missing
    on conflict (meeting_id, user_id) do nothing;
  end if;
end;
$function$;

revoke all on function public.meetings_sync_questioners(uuid) from public, anon;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;

-- Redeclared whole from 20260825120000:48. Two changes, both about eligibility:
-- the auto-pick skips non-rotation candidates so removing someone by hand can
-- never pull a graduate back in, and a MANUAL replacement is rejected for
-- anyone Keycloak places outside the rotation, with a message that says why.
--
-- Manual assignment still accepts a member whose lab_status is NULL. The
-- automation will not choose them, but an admin looking at the panel — where
-- they are visibly marked 未排程 — is making a deliberate, informed call, and
-- the most likely reason for that NULL is a Keycloak rename rather than a
-- departure. A rule that detects a problem must leave someone able to act on
-- it; refusing here would mean the admin can see the person greyed out and do
-- nothing about it.
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
    -- Same explicit ORDER BY as meetings_sync_questioners, for the same reason.
    order by r.last_asked_date asc nulls first, r.pool_added_at asc, r.user_id asc
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
