-- Complete the question-pool union (follow-up to 20260825120000).
-- 1) meetings_sync_questioners' future-only eviction must treat "the pool" as
--    the SAME union the rotation view now uses (question ∪ presenter); otherwise
--    it evicts presenter-pool questioners on every future-meeting resync and
--    silently discards manual overrides.
-- 2) A narrow view for the "額外提問成員" admin panel, which manages ONLY
--    meeting_question_pool and must NOT list presenter-pool members.

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

  -- Future meetings only: a questioner who has since left BOTH pools is no longer
  -- a valid pick — evict them so the backfill refills from the current union.
  -- Past meetings are left untouched (their roster is history).
  if v_meeting.scheduled_date > current_date then
    delete from public.meeting_questioners mq
    where mq.meeting_id = p_meeting_id
      and not exists (
        select 1 from public.meeting_question_pool p where p.user_id = mq.user_id
        union
        select 1 from public.meeting_presenter_pool pp where pp.user_id = mq.user_id
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

-- Narrow "extra members" view: ONLY meeting_question_pool members (the
-- non-presenter extras the admin panel manages), with the same rotation stats
-- columns. security_invoker like the rotation view. The widened
-- meeting_question_rotation stays the union source for sync/replace and the
-- questioners-field manual-swap candidate dropdown.
create or replace view public.meeting_question_pool_members
with (security_invoker = true) as
select
  p.user_id,
  up.name,
  up.email,
  p.created_at as pool_added_at,
  stats.last_asked_date,
  coalesce(stats.times_asked, 0) as times_asked
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
