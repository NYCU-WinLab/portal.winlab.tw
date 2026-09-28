-- Merge fix: two independent changes landed on meetings_swap in the same
-- release and this is their merge, not a third opinion.
--
-- This branch (20260915080357) dropped meetings.semester_id and rewrote the
-- swap's same-semester guard to compare derived semester windows instead.
-- Concurrently on main, PR #1146 followed by its review-fixes migration
-- (20260914170716) moved the rebalance advisory lock to before the two row
-- locks, to close a deadlock cycle with meetings_rebalance_questioners_exec.
-- 20260914170716 sorts after this branch's migration, so a clean replay would
-- otherwise let it win outright and reinstate `v_a.semester_id`, a column
-- that no longer exists.
--
-- Redeclared whole, combining both: the lock-order fix from 20260914170716
-- kept verbatim, and the semester guard from 20260915080357 kept verbatim.
create or replace function public.meetings_swap(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Swap the whole presentation payload (presenter + reading-list paper + ppt /
  -- video / notes). Slot fields (scheduled_date / week_label / is_holiday /
  -- location / start_time) stay put, so questioners stay on the date. For
  -- reading-list rows the trigger re-derives paper_title/paper_link from
  -- teacher_paper_id; for legacy free-text rows the explicit values below stand.
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

  -- self-heal only: evict a questioner that now equals the new presenter, backfill to 3.
  perform public.meetings_sync_questioners(p_a);
  perform public.meetings_sync_questioners(p_b);
end;
$function$;

revoke all on function public.meetings_swap(uuid, uuid) from public, anon;
grant execute on function public.meetings_swap(uuid, uuid) to authenticated, service_role;
