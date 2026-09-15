-- Two hardening fixes for the questioner rotation: #1143 (root cause) and #1145.
--
-- ── #1143: the issue's premise was wrong, and the fix is different ─────────
--
-- The issue proposed flagging six 寒假 weeks (2026-01-05 … 02-09) is_holiday,
-- on the theory that no meeting happened. Meetings DID happen: five of the six
-- carry an uploaded deck, a video link and a paper title. 20260722000100's
-- header already states the convention those rows follow —
--
--   "暑假/寒假 rows are is_holiday=false with a real presenter (meetings still
--    happen — the label is just the phase)"
--
-- — and the data agrees: 13 寒假 weeks and 12 暑假 weeks are all is_holiday
-- false with presenters, while every actual day off (春節, 月考週, 大掃除,
-- 清明連假, 光復節補假, 教師節) is flagged. Flagging those six would have
-- erased six real meetings from the schedule. The proposed CHECK constraint on
-- a holiday vocabulary is dropped for the same reason: 寒假/暑假 are PHASE
-- labels, and the set of legitimate reason labels is not enumerable in advance.
--
-- What was actually wrong is narrower: the questioner rotation did not exist
-- until 2026-06-15, so those eighteen rows describe an activity that had not
-- been invented yet. 20260914092541 closed the ordinary-member path into that
-- state and said so; the admin path stayed open, and this is it.
--
-- THE RULE, stated once: nobody is a candidate for a meeting that happened
-- before they joined the pool. It needs no cutoff constant, because it is the
-- same rule meeting_questioner_stats already applies to both halves of the
-- rate — a member's opportunities and their asks are both bounded below by
-- pool_added_at. Until now the picker did not know about it, so it could
-- assign someone a meeting that their own rate would then refuse to count.
--
-- It also subsumes the January case without naming it: every pool member
-- joined on or after 2026-06-15, so no one is eligible for a January week and
-- an admin re-running sync on one now writes nothing. The eighteen existing
-- rows are data, removed in the migration that follows this one.
--
-- Deliberately NOT changed: the eviction clause still only runs for future
-- weeks. A past week's roster is history even when it is wrong; correcting it
-- is a human decision, not a side effect of an unrelated admin action.
--
-- ── #1145: one lock for every writer of meeting_questioners ───────────────
--
-- meetings_rebalance_questioners_exec takes hashtext('meetings_rebalance_
-- questioners') and meetings_fill_presenters takes hashtext('meetings_fill_
-- presenters:<year>'), and the two never exclude each other — so an admin
-- pressing 自動排定報告人 while another presses 重新平衡提問人 interleaves
-- writes into the same rows and lands on a roster nobody chose. Silently: no
-- error, just an outcome that depends on timing.
--
-- Six functions write meeting_questioners. Four of them go through
-- meetings_sync_questioners (claim, swap, fill_presenters, remove_from_pool),
-- so taking the rebalance lock HERE covers all four; meetings_replace_
-- questioner is the fifth and takes it below; rebalance_exec, the sixth,
-- already holds it. pg_advisory_xact_lock is re-entrant within a transaction,
-- so fill_presenters calling sync sixty times in a loop just increments a
-- counter.
--
-- WHY THIS CANNOT DEADLOCK. The rebalance key is always acquired LAST on every
-- path that holds more than one:
--   * fill_presenters: meetings_fill_presenters:<year> → (sync) → rebalance
--   * pool_upsert / pool_remove: meetings_presenter_pool:<year> → (trigger) →
--     rebalance
--   * rebalance_exec: rebalance, and then nothing — it calls neither sync nor
--     any pool RPC, so no second advisory lock is ever requested behind it.
-- There is no path in the reverse order, so no cycle exists.
--
-- The key string is REUSED verbatim, not renamed to something more accurate.
-- hashtext of a new name is a different lock, and during the minutes when the
-- old and new definitions are both live they would stop excluding each other —
-- precisely when a schema change makes concurrent admin activity likely.
-- questioner-rotation.test.sql asserts all three definitions carry the same
-- literal, which is the guard against a typo silently un-serializing them.

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
  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    return;
  end if;

  -- Same key as meetings_rebalance_questioners_exec (20260914083707) and
  -- meetings_replace_questioner below. Taken before the first write, including
  -- the holiday cleanup: that path deletes rows a concurrent rebalance may be
  -- in the middle of writing.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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

  -- From 20260914092541: an ordinary member cannot cause a past week to be
  -- staffed. Kept as-is. It is about WHO may write recent history; the
  -- join-date filter below is about WHICH history can be written at all, and
  -- binds admins and service_role too.
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
      -- Nobody is a candidate for a meeting older than their own pool join
      -- date. Compared in Asia/Taipei for the same reason 20260914092541 moved
      -- the stats view's lower bound there: a member added at 02:00 Taipei
      -- reads as the previous calendar day in a UTC session.
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

-- Redeclared from 20260914083617: same two changes, plus the manual half.
--
-- An admin naming a replacement by hand gets an error rather than a silent
-- skip. For any future week the check cannot fire (pool_added_at <= today <=
-- scheduled_date), so this only ever speaks up about a past week — where a
-- silent no-op would be worse than a message, because the admin would be left
-- looking at a slot they thought they had just filled.
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

  select * into v_meeting from public.meetings where id = p_meeting_id;
  if not found then
    raise exception '找不到此週次' using errcode = 'P0001';
  end if;

  -- Same key as meetings_sync_questioners above.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

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
    -- Auto-pick: deterministic next-in-rotation candidate, excluding the
    -- presenter, the just-removed member, anyone already assigned, anyone no
    -- longer in the lab, and anyone who joined the pool after this meeting.
    -- May find nobody (pool exhausted) — that's fine, the slot stays open.
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

comment on function public.meetings_sync_questioners(uuid) is
  'Staffs one meeting''s questioner slots. Takes hashtext(''meetings_rebalance_questioners'') — the single advisory lock every writer of meeting_questioners shares. Never picks a member for a meeting that predates their pool join date.';
