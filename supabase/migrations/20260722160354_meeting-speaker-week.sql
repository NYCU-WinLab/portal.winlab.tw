-- Speaker weeks (外部講者演講) as a first-class citizen in /meetings.
--
-- An external speaker (e.g. a visiting professor) has NO user_id. The existing
-- schedule only had two states — presentation (is_holiday=false) and holiday
-- (is_holiday=true) — and "is_holiday=false + presenter_user_id=null" already
-- means "an unclaimed empty week". So a speaker week needs a third, explicit
-- state, otherwise it would wrongly show a claim button, could be assigned
-- questioners, and would be shifted by insert/remove week like a normal slot.
--
-- Design: additive boolean `is_speaker` (NOT a rework of is_holiday into an
-- event_type enum — is_holiday is read/written across every RPC + the UI + the
-- questioner sync, so the enum's blast radius isn't worth it). A speaker week:
--   * is_speaker = true, is_holiday = false (CHECK keeps them mutually exclusive)
--   * presenter  = the speaker's name (free text, e.g. '吳凱強老師')
--   * presenter_user_id = null (external person, never has an account)
--
-- Everything keyed off presenter_user_id is already correct for null: the
-- questioner sync skips null presenters, fairness/paper-cooldown ignore them,
-- and no student "owns" the row. The one thing null alone can't express is
-- "this empty-looking row is intentional" — that's exactly what is_speaker is
-- for, and why meetings_claim must reject it.
--
-- Anchoring: a talk happened on a fixed calendar date, so speaker weeks are
-- anchored during postpone/pull-up exactly like holidays — the date-mover RPCs
-- exclude them from the shift and refuse to target them.
--
-- NOTE: meetings_insert_week / meetings_remove_week are re-created verbatim from
-- 20260721000000_meeting-schedule-edit.sql plus the `and not is_speaker`
-- exclusion + speaker target-guard. If the concurrent week_label↔date work also
-- redefines these functions, the two bodies must be merged by hand (both only
-- add extra conditions/logic to the same functions).

-- ── the third state ──────────────────────────────────────────────────────────
alter table public.meetings
  add column if not exists is_speaker boolean not null default false;

-- a row is at most one of holiday / speaker; presentation is "neither"
alter table public.meetings drop constraint if exists meetings_type_mutex;
alter table public.meetings add constraint meetings_type_mutex
  check (not (is_holiday and is_speaker));

-- Data-layer invariant: a speaker week is an external person with no account,
-- so it must have a null presenter_user_id. This also closes an RLS gap — the
-- meetings_update_own policy only pins presenter_user_id (not which columns
-- change), so without this a non-admin could hand-craft a PATCH setting
-- is_speaker=true on their own row; such a row (is_speaker=true + non-null
-- presenter_user_id) is now rejected by this CHECK. Every legit write path sets
-- presenter_user_id=null for speaker weeks, so they pass.
alter table public.meetings drop constraint if exists meetings_speaker_no_user;
alter table public.meetings add constraint meetings_speaker_no_user
  check (not is_speaker or presenter_user_id is null);

-- ── talk title survives the presentation→speaker switch ──────────────────────
-- A speaker week keeps its talk title in paper_title with teacher_paper_id null.
-- The reading-list sync trigger (20260717051239) cleared paper_title on ANY
-- teacher_paper_id non-null→null transition, which silently wiped the talk title
-- when an admin converted a paper-backed presentation straight into a speaker
-- week (both changes land in one UPDATE, and this BEFORE trigger overrides NEW).
-- Guard the clear with `not new.is_speaker` so a speaker week's app-supplied
-- title survives; an ordinary un-pick (row stays a presentation) still clears.
create or replace function public.meetings_sync_paper_from_teacher()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.teacher_paper_id is not null then
    select tp.paper_name, tp.file_link
      into new.paper_title, new.paper_link
      from public.teacher_papers tp
      where tp.id = new.teacher_paper_id;
  elsif tg_op = 'UPDATE'
        and old.teacher_paper_id is not null
        and new.teacher_paper_id is null
        and not new.is_speaker then
    -- Paper un-picked (and not a switch to a speaker week, which carries its own
    -- talk title in paper_title): clear the stale mirror.
    new.paper_title := null;
    new.paper_link := null;
  end if;
  return new;
end;
$function$;

-- ── claim: a speaker week is not an open slot ────────────────────────────────
create or replace function public.meetings_claim(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_meeting public.meetings;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

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

  perform public.meetings_sync_questioners(p_meeting_id);
end;
$function$;

revoke all on function public.meetings_claim(uuid) from public, anon;
grant execute on function public.meetings_claim(uuid) to authenticated;

-- ── swap: a speaker week is not swappable (like a holiday) ────────────────────
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
  if v_a.is_speaker or v_b.is_speaker then
    raise exception '演講週不可互換' using errcode = 'P0001';
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

-- ── date-mover: insert a blank week — speaker weeks anchored like holidays ────
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
  if v_target.is_speaker then raise exception '不能在演講週插入' using errcode = 'P0001'; end if;
  v_year := v_target.year;

  -- lock the whole year's rows for the multi-row shuffle
  perform 1 from public.meetings where year = v_year for update;

  -- date shifts move rows across the per-paper cooldown window; defer it so only
  -- the valid final arrangement is judged (see swap for the rationale).
  set constraints public.meetings_paper_cooldown deferred;

  -- ordered presentation slots (non-holiday, non-speaker) from the target onward.
  -- Speaker weeks, like holidays, are anchored calendar events: excluded from the
  -- shift so student presentations flow around them.
  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where year = v_year and not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_k := coalesce(array_length(v_ids, 1), 0);
  if v_k = 0 then return null; end if;

  -- mint the trailing slot from the last real PRESENTATION slot: its date + 7
  -- (preserves the schedule's weekday, no hard-coded Monday), skipping any
  -- already-occupied date. Exclude holidays AND speaker weeks, which may sit
  -- chronologically after the last presentation, so the minted week keeps the
  -- schedule's cadence.
  select max(scheduled_date) into v_max_date
  from public.meetings where year = v_year and not is_holiday and not is_speaker;
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

-- ── date-mover: remove a week — speaker weeks anchored like holidays ──────────
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
  if v_target.is_speaker then raise exception '不能刪除演講週' using errcode = 'P0001'; end if;
  v_year := v_target.year;

  perform 1 from public.meetings where year = v_year for update;

  -- presentation slots (non-holiday, non-speaker) from the target onward; speaker
  -- weeks stay anchored, exactly like holidays.
  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where year = v_year and not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_m := coalesce(array_length(v_ids, 1), 0);

  -- date shifts move rows across the per-paper cooldown window; defer it so only
  -- the valid final arrangement is judged (see swap for the rationale).
  set constraints public.meetings_paper_cooldown deferred;

  -- delete the target (its meeting_questioners cascade away)
  delete from public.meetings where id = v_ids[1];

  -- pull each subsequent presentation row up one slot (ascending; slots free as we go).
  -- Content + questioners ride each meeting_id; the trailing date is left with no row.
  for i in 2 .. v_m loop
    update public.meetings set scheduled_date = v_dates[i - 1], week_label = nullif(v_labels[i - 1], '')
    where id = v_ids[i];
  end loop;
end;
$function$;

revoke all on function public.meetings_remove_week(uuid) from public, anon;
grant execute on function public.meetings_remove_week(uuid) to authenticated, service_role;
