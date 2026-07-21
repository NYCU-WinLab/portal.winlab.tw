-- Admin schedule-editing RPCs for /meetings: swap two weeks, insert a week
-- (postpone everyone one week), and remove a week (pull everyone up). All three
-- are admin-only (is_meetings_admin) and reuse #301's rotation model
-- (meetings_sync_questioners) instead of touching meeting_questioners directly.
--
-- Two deliberately-opposite mechanics, chosen so the questioner rules the lab
-- asked for fall out for free — meeting_questioners rows are NEVER moved by
-- hand, they only ride the meeting_id they are bound to:
--
--   * meetings_swap  → CONTENT-mover. Swaps the presentation payload
--     (presenter/paper/ppt/video/notes) between two rows; each row keeps its
--     scheduled_date AND its questioners. So questioners "stay on the date"
--     (the lab's rule for a swap). Only self-heal runs: if the swapped-in
--     presenter was already on that date's questioner list, sync evicts + backfills.
--
--   * meetings_insert_week / meetings_remove_week  → DATE-movers. Keep each
--     row's content + questioners glued to its id and rewrite scheduled_date /
--     week_label across the affected non-holiday slots. So a presenter's
--     questioners "travel with them" (the lab's rule for postpone). Holidays are
--     anchored (excluded from the shift). Because both only move dates,
--     remove_week is the EXACT inverse of insert_week — the UI uses it as the
--     one-click undo for an insert (and as a standalone "delete this week &
--     pull everyone up").
--
-- No global fairness recompute anywhere: fairness (meeting_question_rotation)
-- is derived from MAX(scheduled_date) live, so future unfilled weeks reflect the
-- new dates automatically without re-picking already-assigned weeks.
--
-- Paper travels with the presenter: swap moves teacher_paper_id too (the
-- reading-list source of truth; the meetings_sync_paper_from_teacher trigger
-- re-mirrors paper_title/paper_link). Moving papers/dates transiently violates
-- the reading-list paper constraints, so:
--   * meetings_paper_cooldown (GiST exclusion) is made DEFERRABLE and the RPCs
--     defer it — the transaction only has to reach a valid FINAL state.
--   * meetings_presenter_paper_uniq is a partial index (NOT deferrable), so swap
--     clears teacher_paper_id on both rows first, then sets the swapped values —
--     no transient duplicate (presenter, paper) pair is ever visible.

-- Let schedule edits reach a valid final state through transient intermediates.
-- Exclusion constraints can't be toggled deferrable via ALTER CONSTRAINT (that
-- path is FK-only), so drop + re-add with the SAME definition as the
-- reading-list migration (2026-07-17-meetings-paper-from-reading-list.sql) plus
-- DEFERRABLE. Normal single-row writes stay immediate; only the RPCs below opt
-- into SET CONSTRAINTS ... DEFERRED. Keep this definition in lockstep with that
-- migration if the cooldown rule ever changes.
alter table public.meetings drop constraint if exists meetings_paper_cooldown;
alter table public.meetings add constraint meetings_paper_cooldown
  exclude using gist (
    teacher_paper_id with =,
    daterange(scheduled_date, scheduled_date + 365) with &&
  ) where (teacher_paper_id is not null)
  deferrable initially immediate;

-- ── content-mover: swap two weeks ───────────────────────────────────────────
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

  -- lock both rows in a stable id order to avoid deadlocks under concurrent edits
  perform 1 from public.meetings where id = least(p_a, p_b) for update;
  perform 1 from public.meetings where id = greatest(p_a, p_b) for update;

  select * into v_a from public.meetings where id = p_a;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;
  select * into v_b from public.meetings where id = p_b;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;

  if v_a.year <> v_b.year then
    raise exception '只能在同一年度內互換' using errcode = 'P0001';
  end if;
  if v_a.is_holiday or v_b.is_holiday then
    raise exception '假期週不可互換' using errcode = 'P0001';
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

-- ── date-mover: insert a blank week, postpone everyone one week ──────────────
-- Returns the new blank meeting's id so the UI can offer a one-click undo
-- (meetings_remove_week on that id restores the prior state exactly).
create or replace function public.meetings_insert_week(p_at_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target   public.meetings;
  v_year     int;
  v_ids      uuid[];
  v_dates    date[];
  v_labels   text[];
  v_k        int;
  v_max_date date;
  v_new_date date;
  v_next_no  int;
  v_new_label text;
  v_blank_id uuid;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能在假期週插入' using errcode = 'P0001'; end if;
  v_year := v_target.year;

  -- lock the whole year's rows for the multi-row shuffle
  perform 1 from public.meetings where year = v_year for update;

  -- date shifts move rows across the per-paper cooldown window; defer it so only
  -- the valid final arrangement is judged (see swap for the rationale).
  set constraints public.meetings_paper_cooldown deferred;

  -- ordered non-holiday slots from the target date onward
  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where year = v_year and not is_holiday and scheduled_date >= v_target.scheduled_date;

  v_k := coalesce(array_length(v_ids, 1), 0);
  if v_k = 0 then return null; end if;

  -- mint the trailing slot: last date + 7 (preserves the schedule's weekday, no
  -- hard-coded Monday), skipping any already-occupied date (e.g. a holiday row).
  -- from the last real PRESENTATION slot (exclude holidays, which may sit
  -- chronologically after it), so the minted week keeps the schedule's cadence.
  select max(scheduled_date) into v_max_date
  from public.meetings where year = v_year and not is_holiday;
  v_new_date := v_max_date + 7;
  while exists (select 1 from public.meetings where year = v_year and scheduled_date = v_new_date) loop
    v_new_date := v_new_date + 7;
  end loop;

  select coalesce(max(substring(week_label from '第(\d+)週')::int), 0) + 1
    into v_next_no
  from public.meetings
  where year = v_year and week_label ~ '第\d+週';
  v_new_label := '第' || v_next_no || '週';

  -- shift each content row one slot later (last→first avoids transient dup dates).
  -- Row at index i moves to slot i+1; the last row takes the freshly minted slot.
  for i in reverse v_k .. 1 loop
    if i = v_k then
      update public.meetings set scheduled_date = v_new_date, week_label = v_new_label
      where id = v_ids[i];
    else
      update public.meetings set scheduled_date = v_dates[i + 1], week_label = nullif(v_labels[i + 1], '')
      where id = v_ids[i];
    end if;
  end loop;

  -- blank week at the freed earliest slot
  insert into public.meetings (year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values (v_year, nullif(v_labels[1], ''), v_dates[1], false, null, null)
  returning id into v_blank_id;

  return v_blank_id;
end;
$function$;

revoke all on function public.meetings_insert_week(uuid) from public, anon;
grant execute on function public.meetings_insert_week(uuid) to authenticated, service_role;

-- ── date-mover: remove a week, pull everyone up (inverse of insert) ──────────
create or replace function public.meetings_remove_week(p_at_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target public.meetings;
  v_year   int;
  v_ids    uuid[];
  v_dates  date[];
  v_labels text[];
  v_m      int;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能刪除假期週' using errcode = 'P0001'; end if;
  v_year := v_target.year;

  perform 1 from public.meetings where year = v_year for update;

  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where year = v_year and not is_holiday and scheduled_date >= v_target.scheduled_date;

  v_m := coalesce(array_length(v_ids, 1), 0);

  -- date shifts move rows across the per-paper cooldown window; defer it so only
  -- the valid final arrangement is judged (see swap for the rationale).
  set constraints public.meetings_paper_cooldown deferred;

  -- delete the target (its meeting_questioners cascade away)
  delete from public.meetings where id = v_ids[1];

  -- pull each subsequent non-holiday row up one slot (ascending; slots free as we go).
  -- Content + questioners ride each meeting_id; the trailing date is left with no row.
  for i in 2 .. v_m loop
    update public.meetings set scheduled_date = v_dates[i - 1], week_label = nullif(v_labels[i - 1], '')
    where id = v_ids[i];
  end loop;
end;
$function$;

revoke all on function public.meetings_remove_week(uuid) from public, anon;
grant execute on function public.meetings_remove_week(uuid) to authenticated, service_role;
