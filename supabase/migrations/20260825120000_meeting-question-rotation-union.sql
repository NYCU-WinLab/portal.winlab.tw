-- Widen the questioner rotation candidate set to the UNION of the presenter
-- roster and the (now "extra members only") question pool. Presenters become
-- auto-eligible questioners; meeting_question_pool is where non-presenting
-- extras (e.g. new students) are added. meetings_sync_questioners is
-- unchanged — it already reads this view. Fixes the "same few people repeat"
-- complaint by enlarging the pool. Keeps security_invoker = true (see
-- 20260706…:78-82).
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
  coalesce(stats.times_asked, 0) as times_asked
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

-- meetings_replace_questioner's MANUAL-replacement eligibility check reads
-- meeting_question_pool directly, bypassing the view above — so a
-- presenter-pool-only member was a valid AUTO-pick candidate but got
-- rejected on MANUAL assignment. Widen the check to the same union the
-- rotation view now draws from, so auto and manual agree on who's eligible.
-- Byte-for-byte identical to 20260706000000_meeting-question-pool.sql:230-305
-- otherwise (that migration is applied to prod and stays immutable).
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
    -- presenter, the just-removed member, and anyone already assigned. May
    -- find nobody (pool exhausted) — that's fine, the slot stays open.
    select r.user_id into v_next
    from public.meeting_question_rotation r
    where r.user_id <> p_remove_user
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
