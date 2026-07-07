-- Follow-up to 20260706000000_meeting-question-pool: when a member is removed
-- from the question pool, they should stop appearing as a questioner on FUTURE
-- meetings (past meetings are history and must stay intact — meeting_questioners
-- FKs user_profiles, not the pool, precisely so leaving the pool never erases a
-- past assignment).
--
-- Two parts:
--   1. meetings_sync_questioners now also evicts questioners who are no longer
--      in the pool, but ONLY for meetings scheduled in the future. This makes
--      sync the single source of truth for "what a valid upcoming roster is":
--      not the presenter, only current pool members, topped up to 3.
--   2. A new admin-only meetings_remove_from_pool() RPC removes a member and
--      re-syncs exactly their future meetings in one transaction, so the portal
--      "remove from pool" action cleans up upcoming rosters immediately instead
--      of leaving the departed member stranded until each week is next touched.

-- 1. Add the future-only left-pool eviction to the sync reconciler ------------
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

  -- Evict a questioner row that now equals the presenter (e.g. the presenter
  -- was changed after questioners were already assigned).
  delete from public.meeting_questioners
  where meeting_id = p_meeting_id and user_id = v_meeting.presenter_user_id;

  -- Future meetings only: a questioner who has since left the pool is no longer
  -- a valid pick — evict them so the backfill below refills the slot from the
  -- current pool. Past meetings are left untouched (their roster is history).
  if v_meeting.scheduled_date > current_date then
    delete from public.meeting_questioners mq
    where mq.meeting_id = p_meeting_id
      and not exists (
        select 1 from public.meeting_question_pool p where p.user_id = mq.user_id
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
    -- Explicit ORDER BY: a view's internal ordering is not guaranteed to
    -- survive an outer WHERE + LIMIT, and rotation fairness depends on it.
    order by r.last_asked_date asc nulls first, r.pool_added_at asc, r.user_id asc
    limit v_missing
    on conflict (meeting_id, user_id) do nothing;
  end if;
end;
$function$;

-- 2. Admin-only "remove from pool" that also cleans upcoming rosters ----------
create or replace function public.meetings_remove_from_pool(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meeting_id uuid;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理提問成員池' using errcode = '42501';
  end if;

  delete from public.meeting_question_pool where user_id = p_user;

  -- Re-sync only the FUTURE meetings where they were still a questioner:
  -- sync() now sees them as not-in-pool and evicts + backfills from the pool.
  -- Past meetings are intentionally not visited, so history is preserved.
  for v_meeting_id in
    select distinct mq.meeting_id
    from public.meeting_questioners mq
    join public.meetings m on m.id = mq.meeting_id
    where mq.user_id = p_user
      and m.scheduled_date > current_date
  loop
    perform public.meetings_sync_questioners(v_meeting_id);
  end loop;
end;
$function$;

-- Same lockdown as the other RPCs: Supabase default privileges auto-grant anon
-- EXECUTE on new functions, and revoking from PUBLIC doesn't touch that direct
-- grant — so revoke anon explicitly. Admin-only in the body; authenticated
-- grant is what the portal calls with.
revoke all on function public.meetings_remove_from_pool(uuid) from public, anon;
grant execute on function public.meetings_remove_from_pool(uuid) to authenticated;
