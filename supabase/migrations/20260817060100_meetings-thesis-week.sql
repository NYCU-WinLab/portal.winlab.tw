-- A student presenting their own master's thesis has no reading-list entry to
-- pick, so since 20260717051239 locked the Paper field to teacher_papers they
-- have had nowhere to put the title but the notes column — which leaves the
-- schedule's Paper cell empty, makes ReminderEmail.gs read the week as "主題待定"
-- and keep nagging them, and drops the title from the PPT filename that
-- api/meetings/upload builds.
--
-- Reopening free text for every presentation week would hand everyone a way
-- around the three reading-list rules (FK to a real paper, the 365-day cooldown,
-- no self-repeat). A thesis is an exception, and an exception needs TWO KEYS:
--
--   1. an admin marks the week is_thesis  (this migration pins the flag to
--      admins in meetings_guard_columns)
--   2. the presenter types their own title (the guard's one carve-out)
--
-- Neither party can produce a free-text paper week alone.
--
-- The storage side is not new ground: a speaker week has kept a free-form title
-- in paper_title since 20260722160354, so every consumer downstream already
-- handles text that did not come from teacher_papers — ReminderEmail.gs escapes
-- it, api/meetings/upload strips filename metacharacters. A thesis week reuses
-- exactly that path. The cooldown and no-self-repeat indexes are keyed on
-- teacher_paper_id, which stays null here, so they simply do not apply — correct,
-- since a thesis is presented once.

alter table public.meetings
  add column if not exists is_thesis boolean not null default false;

-- The three week kinds stay mutually exclusive. Scoped to is_thesis on purpose:
-- every existing row has is_thesis = false, so this cannot fail validation, and
-- whatever is_holiday/is_speaker already allow is not this migration's business.
alter table public.meetings drop constraint if exists meetings_thesis_exclusive;
alter table public.meetings add constraint meetings_thesis_exclusive
  check (not (is_thesis and (is_holiday or is_speaker)));

-- ── free-form title weeks now include thesis ────────────────────────────────
-- Same contract as before plus is_thesis, and the free-form title is normalized
-- on the way in. Keep in lockstep with meetings_guard_columns: that trigger
-- decides WHO may supply a title, this one decides WHAT is stored.
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
  elsif new.is_speaker or new.is_thesis then
    -- The two sanctioned free-title kinds: an external speaker's talk, and a
    -- student's own thesis. paper_title is the single field a caller may supply
    -- here, so normalize it — control characters break both the schedule table
    -- and the "{date} {paperTitle}.{ext}" filename that api/meetings/upload
    -- builds, and an unbounded title would wreck the same two places.
    -- paper_link is deliberately NOT taken from input: a thesis PDF gets its
    -- link from the upload route, server-side, so no user-supplied URL is ever
    -- rendered as an <a href> for the lab.
    new.paper_title := nullif(
      btrim(
        regexp_replace(coalesce(new.paper_title, ''), '[[:cntrl:]]', ' ', 'g')
      ),
      ''
    );
    if new.paper_title is not null then
      new.paper_title := left(new.paper_title, 300);
    end if;
  elsif tg_op = 'UPDATE'
        and old.teacher_paper_id is not null
        and new.teacher_paper_id is null then
    -- Paper was un-picked (and this is not a free-title week, which the branch
    -- above already returned): clear the mirror so a stale title/link doesn't
    -- linger.
    new.paper_title := null;
    new.paper_link := null;
  end if;
  return new;
end;
$function$;

-- ── the guard learns about thesis weeks ─────────────────────────────────────
-- Identical to 20260817060000 except for the two thesis lines; redeclared whole
-- because that is how this repo versions a trigger function.
create or replace function public.meetings_guard_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if public.is_meetings_admin() then
    return new;
  end if;

  -- Slot fields: when, where, and what kind of week this is. is_thesis lives
  -- here — flagging the exception is key #1, and it is the admin's alone.
  new.year           := old.year;
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

-- ── swap refuses thesis weeks ───────────────────────────────────────────────
-- meetings_swap is a CONTENT-mover: it trades presenter + paper + files between
-- two rows. A thesis title belongs to the person who wrote it, so moving it to
-- another presenter's week is never right — refuse it the way speaker and
-- holiday weeks are already refused, instead of silently producing a week whose
-- title describes someone else's thesis. Redeclared whole from
-- 20260722160354; the only change is the is_thesis check.
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

-- meetings_claim already refuses holiday and speaker weeks. A thesis week is
-- assigned by an admin together with its flag, never grabbed off the board.
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

  if v_meeting.is_thesis then
    raise exception '碩論週由管理員指定，無法認領' using errcode = 'P0001';
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

-- ── auto-fill skips thesis weeks ────────────────────────────────────────────
-- meetings_fill_presenters hands unassigned weeks to the presenter pool in
-- rotation. A thesis week is assigned by an admin to one specific person -- the
-- author -- so letting the rotation grab one before that admin sets the
-- presenter would put a random member in front of someone else's thesis.
-- Excluded the same way speaker weeks already are. Redeclared whole from
-- 20260807000000; the only change is the `and not is_thesis` filter.
create or replace function public.meetings_fill_presenters(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_roster   uuid[];
  v_names    text[];
  v_size     int;
  v_index    int := 0;
  v_meeting  record;
  v_filled   int := 0;
  v_updated  int;
  v_attempts int;
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可排定報告人' using errcode = '42501';
  end if;

  -- Serialize concurrent fills of the same year, mirroring
  -- meetings_generate_semester's lock discipline.
  perform pg_advisory_xact_lock(hashtext('meetings_fill_presenters:' || p_year::text));

  select array_agg(p.user_id order by p.admission_year asc, p.sort_order asc, p.user_id asc),
         array_agg(coalesce(up.name, up.email, p.user_id::text)
                   order by p.admission_year asc, p.sort_order asc, p.user_id asc)
  into v_roster, v_names
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id;

  v_size := coalesce(array_length(v_roster, 1), 0);
  if v_size = 0 then
    return jsonb_build_object('filled', 0, 'poolSize', 0);
  end if;

  for v_meeting in
    select id
    from public.meetings
    where year = p_year
      and not is_holiday
      and not is_speaker
      and not is_thesis
      and presenter_user_id is null
      and presenter is null
      -- The lab is in Taipei; the database session is not. Comparing against
      -- current_date (UTC by default on Supabase) would treat a Taipei
      -- morning as "yesterday" for eight hours and quietly fill a week that
      -- has already happened.
      and scheduled_date >= v_today
    order by scheduled_date asc, id asc
  loop
    v_attempts := 0;

    loop
      begin
        update public.meetings
        set presenter = v_names[(v_index % v_size) + 1],
            presenter_user_id = v_roster[(v_index % v_size) + 1]
        where id = v_meeting.id
          -- Re-assert the predicate at write time. The cursor is a snapshot,
          -- and meetings_claim can land between the two — without this a
          -- student's claim is silently overwritten and reported as filled.
          and presenter_user_id is null
          and presenter is null;
        get diagnostics v_updated = row_count;
        exit;
      exception when unique_violation then
        -- meetings_presenter_paper_uniq is a partial index and cannot be
        -- deferred: if this week already carries a reading-list paper the
        -- candidate has presented before, the insert fails. Without this
        -- handler the exception would abort the whole fill and leave every
        -- other week unassigned. Try the next member instead; give up on
        -- this week once the roster has been exhausted.
        v_index := v_index + 1;
        v_attempts := v_attempts + 1;
        if v_attempts >= v_size then
          v_updated := 0;
          exit;
        end if;
      end;
    end loop;

    if v_updated > 0 then
      -- Same convention as every other mutation in this app: a presenter
      -- change invalidates the questioner roster for that week.
      perform public.meetings_sync_questioners(v_meeting.id);
      v_index := v_index + 1;
      v_filled := v_filled + 1;
    end if;
    -- Deliberately no index advance when nothing was written: the candidate
    -- did not get a week, so they stay next in line.
  end loop;

  return jsonb_build_object('filled', v_filled, 'poolSize', v_size);
end;
$function$;
