-- Review fixes for 20260914163700 (PR #1146). Two are defects that migration
-- introduced; the rest are corrections to claims its header makes.
--
-- ── 1. THE LOCK WAS TAKEN AFTER THE READ IT PROTECTS ──────────────────────
--
-- 20260914163700 put `perform pg_advisory_xact_lock(...)` after
-- `select * into v_meeting`, so a caller that waits on the lock resumes
-- holding a snapshot of the row as it looked BEFORE the waiting started, and
-- then branches on it. Reproduced against a scratch database with two
-- connections:
--
--   T1  advisory lock; update meetings set presenter_user_id = P where id = W;
--       insert three questioners; (hold)
--   T3  meetings_sync_questioners(W) — reads W with presenter_user_id NULL
--       (T1 uncommitted), then blocks on the lock
--   T1  commit
--   T3  wakes with the stale v_meeting, takes the `presenter_user_id is null`
--       branch, and deletes the three rows T1 just committed. No error.
--
--   final state: presenter = P, questioners = 0
--
-- Taking the lock made this deterministic rather than merely possible: before
-- 20260914163700 T3 never waited, so its delete almost always ran before T1's
-- rows existed. The check-then-act the lock was added to prevent was being
-- performed across the lock instead of behind it.
--
-- The fix is to take the lock first, in both functions. Re-running the probe
-- with the lock moved leaves the three rows in place. Locking before the
-- not-found early return is harmless — an advisory xact lock on a missing
-- meeting is released at commit like any other.
--
-- ── 2. "WHY THIS CANNOT DEADLOCK" WAS TRUE ONLY OF ADVISORY LOCKS ─────────
--
-- The header enumerated every advisory key and concluded no cycle exists. It
-- did not count ROW locks, and the reverse edge is made of those.
-- meetings_swap takes `for update` on both meetings rows and only then calls
-- sync, which now asks for the rebalance key; meetings_rebalance_questioners_exec
-- takes the rebalance key first and then inserts into meeting_questioners,
-- whose FK to meetings requires `for key share` on the same rows. Also
-- reproduced, rather than argued:
--
--   ERROR:  deadlock detected
--   DETAIL: Process 770 waits for ExclusiveLock on advisory lock
--           [5,4294967295,3698324498,1]; blocked by process 769.
--           Process 769 waits for ShareLock on transaction 1581;
--           blocked by process 770.
--
-- Postgres aborts one side with 40P01, so this is a loud failure rather than
-- the silent interleaving #1145 was about — but 20260914163700 created the
-- cycle, because before it swap never asked for that key at all.
--
-- THE INVARIANT, now uniform: any function that locks `meetings` rows and
-- later reaches meeting_questioners must take the rebalance key BEFORE the row
-- locks. meetings_swap and meetings_claim are redeclared below to do that.
-- meetings_claim is safe today without it — a claimable week has no presenter
-- and so is outside rebalance_scope — but that safety rests on a predicate in
-- a different function, which is not a property anyone should have to
-- rediscover. meetings_fill_presenters needs no change: its plain `update`
-- takes `for no key update`, which does not conflict with `for key share`.
--
-- STILL OPEN, and deliberately not fixed here: meetings_remove_week locks every
-- row of a semester and then deletes meetings, cascading into
-- meeting_questioners; a direct `delete()` from the client does the same. Both
-- can still form a row-level cycle with a running rebalance. Pre-existing,
-- unchanged by this PR, millisecond window, and the outcome is 40P01 rather
-- than a wrong roster. Tracked rather than widened into this migration.
--
-- ── 3. CORRECTIONS TO 20260914163700's AND 20260914163728's HEADERS ───────
--
-- Recorded here because those files must keep saying what actually ran.
--
-- (a) "Six functions write meeting_questioners" undercounts by one: it is
--     SEVEN — three directly (meetings_sync_questioners,
--     meetings_replace_questioner, meetings_rebalance_questioners_exec) and
--     four through sync (meetings_claim, meetings_swap,
--     meetings_fill_presenters, meetings_remove_from_pool). The sentence
--     omitted sync itself, which is both a writer and the function the
--     paragraph is about. The lock argument is unaffected — every path still
--     ends in one of the three that take the key.
-- (b) "since 20260706000000 mirrored meeting_groups' grant block wholesale"
--     (20260914163759) is right for meeting_question_pool and
--     meeting_questioners only. meeting_presenter_pool's identical grants came
--     from 20260807000000:58-60.
-- (c) "fill_presenters calling sync sixty times in a loop" — sixty was
--     illustrative. It calls sync once per week it fills.
-- (d) 20260914084840 described the six 2026-01/02 寒假 weeks as "an artefact of
--     a holiday that was labelled but not flagged" and chose to leave their
--     questioner rows in place. Both are superseded: those weeks were real
--     meetings (five of six have a deck, a video link and a paper title), and
--     20260914163728 deleted the rows.
-- (e) meeting_presenter_pool's comment said the FK-cascade rebalance path is
--     reachable only by service_role. Deleting the auth.users row behind a
--     profile reaches it too, and that runs as supabase_auth_admin from the
--     dashboard or the Auth Admin API. Reworded below.

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
  -- BEFORE the read, not after it. Everything below branches on v_meeting, and
  -- a plpgsql variable does not refresh when the lock is finally granted.
  -- Same key as meetings_rebalance_questioners_exec (20260914083707).
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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

  if v_meeting.scheduled_date < v_today
     and auth.uid() is not null
     and not public.is_meetings_admin() then
    return;
  end if;

  select count(*) into v_current_count
  from public.meeting_questioners
  where meeting_id = p_meeting_id;

  v_missing := 3 - v_current_count;

  while v_missing > 0 loop
    insert into public.meeting_questioners (meeting_id, user_id, source)
    select p_meeting_id, r.user_id, 'auto'
    from public.meeting_question_rotation r
    where r.user_id <> v_meeting.presenter_user_id
      and r.is_active
      and (r.pool_added_at at time zone 'Asia/Taipei')::date <= v_meeting.scheduled_date
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

    exit when not found;
    v_missing := v_missing - 1;
  end loop;
end;
$function$;

revoke all on function public.meetings_sync_questioners(uuid) from public, anon;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;

create or replace function public.meetings_replace_questioner(
  p_meeting_id  uuid,
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

  -- Before the read, for the reason given in this migration's header: the
  -- presenter check below compares against v_meeting, and a swap committing
  -- while this call waits would otherwise leave it comparing against the old
  -- presenter.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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
      select 1 from public.meeting_question_rotation r
      where r.user_id = p_replacement
        and (r.pool_added_at at time zone 'Asia/Taipei')::date > v_meeting.scheduled_date
    ) then
      raise exception '替補人選在本週次之後才加入成員池' using errcode = 'P0001';
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
    select r.user_id into v_next
    from public.meeting_question_rotation r
    where r.user_id <> p_remove_user
      and r.is_active
      and (v_meeting.presenter_user_id is null or r.user_id <> v_meeting.presenter_user_id)
      and (r.pool_added_at at time zone 'Asia/Taipei')::date <= v_meeting.scheduled_date
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
grant execute on function public.meetings_replace_questioner(uuid, uuid, uuid) to authenticated, service_role;

-- Redeclared from 20260828120001, unchanged except for the lock on the first
-- line of the body. It has to precede the two `for update` row locks, not just
-- the sync calls at the bottom: the cycle is formed by holding meetings rows
-- while waiting for the key.
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

  -- Rebalance key BEFORE the row locks. See this migration's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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

  set constraints public.meetings_paper_cooldown deferred;

  update public.meetings set teacher_paper_id = null where id in (p_a, p_b);

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

  perform public.meetings_sync_questioners(p_a);
  perform public.meetings_sync_questioners(p_b);
end;
$function$;

revoke all on function public.meetings_swap(uuid, uuid) from public, anon;
grant execute on function public.meetings_swap(uuid, uuid) to authenticated, service_role;

-- Redeclared from 20260817060100, unchanged except for the lock. Safe without
-- it today only because a claimable week has no presenter and is therefore
-- outside rebalance_scope — a guarantee that lives in a different function's
-- WHERE clause. Made unconditional instead.
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

  -- Rebalance key BEFORE the row lock. See this migration's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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

revoke all on function public.meetings_claim(uuid) from public, anon;
grant execute on function public.meetings_claim(uuid) to authenticated, service_role;

comment on function public.meetings_sync_questioners(uuid) is
  'Staffs one meeting''s questioner slots. Takes hashtext(''meetings_rebalance_questioners'') as its FIRST action — the advisory lock every FUNCTION that writes meeting_questioners shares. A meetings admin''s direct DML on the table, and the ON DELETE CASCADE from meetings, still bypass it. Never picks a member for a meeting that predates their pool join date.';

comment on table public.meeting_presenter_pool is
  'Presenter rotation roster; also the primary half of the questioner pool. WRITING TO THIS TABLE REWRITES THE SCHEDULE — see meeting_question_pool''s comment. Note also that the FK to user_profiles is ON DELETE CASCADE, and a cascade delete arrives at the statement trigger with a non-empty transition table: deleting one account rebalances every future week. No RLS policy lets a signed-in member delete a profile, and user_profiles.id cascades from auth.users, so that path is reachable only by service_role or by supabase_auth_admin deleting the auth user (dashboard / Auth Admin API).';

comment on function public.meetings_rebalance_questioners_exec(boolean) is
  'Rebalance engine. No authorization check by design — the wrapper and the pool triggers are the callers, and both have done the checking. LOCK ORDER: takes hashtext(''meetings_rebalance_questioners'') first and then row locks on meetings (via the meeting_questioners FK). Any function that locks meetings rows and later reaches meeting_questioners MUST take this key before those row locks, or the two form a deadlock cycle.';
