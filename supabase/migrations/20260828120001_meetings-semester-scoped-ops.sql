-- 20260828120000 gave /meetings a first-class semester. This migration moves the
-- week-numbering and schedule-editing logic onto it.
--
-- Everything here used to be scoped to public.meetings.year — a CALENDAR year,
-- which holds two teaching terms. That is what made `第N週` run straight through
-- 第16週 into 第17週, and what let an insert in 上學期 shift 下學期's rows around.
-- `meetings.year` itself keeps its current meaning and is still written exactly as
-- before; it simply stops being the unit that numbering and shuffling restart on.
--
-- Each function below is a `create or replace` of the newest definition, copied
-- whole and changed only where noted — that is how this repo versions a function
-- or trigger (see 20260817060100:84-85). The named sources are:
--   meetings_generate_semester → 20260722000000:25
--   meetings_insert_week       → 20260722160354:222
--   meetings_remove_week       → 20260722160354:316
--   meetings_swap              → 20260817060100:144
--   meetings_guard_columns     → 20260817060100:86
--
-- All four RPCs are SECURITY DEFINER, which is what lets them call
-- public.meeting_semester_for_date — EXECUTE on it is revoked from public, anon
-- AND authenticated, so it is reachable only from an owner-privileged context.

-- ── generate: one semester per call, and the numbers belong to it ────────────
-- Changes from 20260722000000:
--   * resolves the semester once from p_start_date and keys the advisory lock on
--     it instead of on p_year (two terms of one calendar year are now two locks,
--     and one term is one lock even if its weeks straddle New Year);
--   * re-stamps the semester's own start_date / planned_weeks, but only while the
--     semester still holds no weeks, so a generate never rewrites the frame of a
--     semester that is already running;
--   * the per-date skip is scoped to the semester rather than the year bucket;
--   * a per-row LABEL-collision skip: a semester that already holds 第i週 does not
--     get a second one. This is what makes a re-run from a SHIFTED start date
--     harmless — no date collides, but every number is taken. It is deliberately a
--     PER-ROW skip and not a whole-batch refusal, so partial generation into a
--     semester that already holds a week keeps working (the existing
--     skip-then-idempotent-re-run assertions depend on it), and it sits AFTER the
--     date check so a same-date re-run is still reported the way it always was;
--   * both INSERTs stamp semester_id explicitly. Generate accepts up to 60 weeks,
--     so ONE generated semester can itself straddle January→February; leaving the
--     BEFORE INSERT safety net to guess would split that single semester in two.
create or replace function public.meetings_generate_semester(
  p_year int,
  p_start_date date,
  p_weeks int,
  p_holidays jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inserted int := 0;
  v_skipped  int := 0;
  v_date     date;
  v_reason   text;
  v_semester_id uuid;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可產生排班' using errcode = '42501';
  end if;
  if p_start_date is null then
    raise exception '缺少起始日期' using errcode = 'P0001';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 60 then
    raise exception '週數必須介於 1 與 60 之間' using errcode = 'P0001';
  end if;

  -- The semester this call is generating, found or minted from the start date.
  -- Resolved once and stamped on every row below; never re-derived per date,
  -- because a 16-week 上學期 can reach into February.
  v_semester_id := public.meeting_semester_for_date(p_start_date);

  -- Serialize concurrent generates for the same SEMESTER: two admins generating
  -- at once would both pass the per-date existence check and double-insert. A
  -- transaction-scoped advisory lock keyed on the semester is enough (different
  -- semesters never collide, and generate only appends).
  perform pg_advisory_xact_lock(hashtext('meetings_generate_semester:' || v_semester_id::text));

  -- start_date / planned_weeks are informational metadata about the semester's
  -- frame — nothing branches on them. Take the generation's parameters only while
  -- the semester is still empty: once it has weeks, its real frame is whatever the
  -- schedule says, and a later generate must not rewrite it. (A semester minted
  -- incidentally by the safety net keeps whichever date got there first and a null
  -- planned_weeks; that is accepted.) Inside the lock so a concurrent generate of
  -- the same fresh semester cannot stamp its numbers after ours inserted.
  update public.meeting_semesters
  set start_date = p_start_date, planned_weeks = p_weeks
  where id = v_semester_id
    and not exists (select 1 from public.meetings where semester_id = v_semester_id);

  for i in 1 .. p_weeks loop
    -- +7 per step preserves the start date's own weekday (no hard-coded Monday).
    v_date := p_start_date + (i - 1) * 7;

    if exists (
      select 1 from public.meetings
      where semester_id = v_semester_id and scheduled_date = v_date
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- This semester already has a 第i週. Inserting another would give the term two
    -- rows claiming the same week number — the exact confusion this whole feature
    -- exists to remove. Count it as skipped and move on. Matches 第i週 by prefix so
    -- a hand-typed 第i週(原因) still counts as taken.
    if exists (
      select 1 from public.meetings
      where semester_id = v_semester_id and week_label ~ ('^第' || i || '週')
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- A holiday is any generated date present in p_holidays; SELECT ... INTO
    -- resets v_reason to NULL when no row matches, so no value leaks across
    -- iterations.
    select h ->> 'label' into v_reason
    from jsonb_array_elements(coalesce(p_holidays, '[]'::jsonb)) as h
    where nullif(h ->> 'date', '')::date = v_date
    limit 1;

    if v_reason is not null and v_reason <> '' then
      insert into public.meetings
        (year, semester_id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        (p_year, v_semester_id, '第' || i || '週(' || v_reason || ')', v_date, true, null, null);
    else
      insert into public.meetings
        (year, semester_id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        (p_year, v_semester_id, '第' || i || '週', v_date, false, null, null);
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$function$;

revoke all on function public.meetings_generate_semester(int, date, int, jsonb) from public, anon;
grant execute on function public.meetings_generate_semester(int, date, int, jsonb) to authenticated, service_role;

-- ── date-mover: insert a blank week, within one semester ─────────────────────
-- Redeclared whole from 20260722160354:222. Every `year = v_year` predicate is now
-- `semester_id = v_semester_id`: the row lock, the slot array, the max-date lookup,
-- the free-date scan, and the label mint. The label mint is the overflow fix — the
-- next number comes from THIS semester's numbers, so 上學期's 第16週 is followed by
-- 下學期's 第1週, not 第17週.
--
-- v_year survives because the trailing INSERT still writes the `year` column with
-- exactly the value it always did.
create or replace function public.meetings_insert_week(p_at_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target   public.meetings;
  v_year     int;
  v_semester_id uuid;
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
  v_semester_id := v_target.semester_id;

  -- lock the whole semester's rows for the multi-row shuffle
  perform 1 from public.meetings where semester_id = v_semester_id for update;

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
  where semester_id = v_semester_id and not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_k := coalesce(array_length(v_ids, 1), 0);
  if v_k = 0 then return null; end if;

  -- mint the trailing slot from the last real PRESENTATION slot: its date + 7
  -- (preserves the schedule's weekday, no hard-coded Monday), skipping any
  -- already-occupied date. Exclude holidays AND speaker weeks, which may sit
  -- chronologically after the last presentation, so the minted week keeps the
  -- schedule's cadence.
  select max(scheduled_date) into v_max_date
  from public.meetings where semester_id = v_semester_id and not is_holiday and not is_speaker;
  v_new_date := v_max_date + 7;
  while exists (select 1 from public.meetings where semester_id = v_semester_id and scheduled_date = v_new_date) loop
    v_new_date := v_new_date + 7;
  end loop;

  select coalesce(max(substring(week_label from '第(\d+)週')::int), 0) + 1
    into v_next_no
  from public.meetings
  where semester_id = v_semester_id and week_label ~ '第\d+週';
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

  -- blank week at the freed earliest slot. semester_id is stamped EXPLICITLY, not
  -- left to the BEFORE INSERT safety net: the appended tail of 上學期 can land in
  -- February, and the date-derived guess would move it into 下學期 and restart its
  -- numbering.
  insert into public.meetings (year, semester_id, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values (v_year, v_semester_id, nullif(v_labels[1], ''), v_dates[1], false, null, null)
  returning id into v_blank_id;

  return v_blank_id;
end;
$function$;

revoke all on function public.meetings_insert_week(uuid) from public, anon;
grant execute on function public.meetings_insert_week(uuid) to authenticated, service_role;

-- ── date-mover: remove a week, within one semester ───────────────────────────
-- Redeclared whole from 20260722160354:316; every `year = v_year` becomes
-- `semester_id = v_semester_id`. This function inserts nothing, so it has no
-- remaining use for v_year and the variable is gone.
create or replace function public.meetings_remove_week(p_at_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target public.meetings;
  v_semester_id uuid;
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
  v_semester_id := v_target.semester_id;

  perform 1 from public.meetings where semester_id = v_semester_id for update;

  -- presentation slots (non-holiday, non-speaker) from the target onward; speaker
  -- weeks stay anchored, exactly like holidays.
  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where semester_id = v_semester_id and not is_holiday and not is_speaker
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

-- ── swap trades content within one semester ──────────────────────────────────
-- Redeclared whole from 20260817060100:144; the only change is that the same-year
-- guard becomes a same-SEMESTER guard. Year was always a proxy for "the same
-- schedule"; now that the schedule has a real identity, use it. Two rows in the
-- same calendar year but different terms are two different schedules, and trading
-- a presenter between them is not a swap, it is a reassignment.
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

  if v_a.semester_id <> v_b.semester_id then
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

-- ── the guard pins semester_id too ──────────────────────────────────────────
-- Redeclared whole from 20260817060100:86; the only change is the semester_id
-- line. It belongs with the other slot fields and was missed when the column
-- landed: without it a presenter could PATCH their own row into another semester,
-- which renumbers that semester's weeks around them and moves their week out of
-- the schedule everyone else is reading.
create or replace function public.meetings_guard_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('role', true) = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.is_meetings_admin() then
    return new;
  end if;

  -- Slot fields: when, where, and what kind of week this is. is_thesis lives
  -- here — flagging the exception is key #1, and it is the admin's alone.
  new.year           := old.year;
  new.semester_id    := old.semester_id;
  new.week_label     := old.week_label;
  new.scheduled_date := old.scheduled_date;
  new.is_holiday     := old.is_holiday;
  new.is_speaker     := old.is_speaker;
  new.is_thesis      := old.is_thesis;
  new.location       := old.location;
  new.start_time     := old.start_time;
  new.created_at     := old.created_at;

  -- Claiming an empty slot (meetings_claim) is the one sanctioned non-admin
  -- transition: null -> yourself. See 20260817060000 for why it cannot be
  -- reached through PostgREST.
  if not (old.presenter_user_id is null and new.presenter_user_id = auth.uid())
  then
    new.presenter         := old.presenter;
    new.presenter_user_id := old.presenter_user_id;
  end if;

  -- Key #2: on a week an admin has already flagged as a thesis, the presenter
  -- writes their own title. Read OLD, not NEW — the flag was pinned above, so
  -- flipping is_thesis and writing a title in one statement is not a shortcut
  -- around key #1. Everywhere else the title stays derived.
  if not old.is_thesis then
    new.paper_title := old.paper_title;
  end if;

  -- Never user-supplied, on any kind of week.
  new.paper_link := old.paper_link;

  return new;
end;
$function$;
