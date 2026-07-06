-- Replace the fixed meeting_groups rotation with a question-member POOL plus
-- automatic, fair scheduling of 3 questioners per week.
--
-- Model:
--   * meeting_question_pool: membership ONLY (who is currently eligible to be
--     picked). No counters, no "next up" pointer — either of those would just
--     drift out of sync with reality; the rotation view below derives
--     everything from history instead.
--   * meeting_questioners: the actual weekly assignment (meeting_id × user_id),
--     source 'auto' (system-picked) or 'manual' (admin override). FKs to
--     user_profiles, NOT to the pool — leaving the pool must not erase a
--     member's history, since fairness is computed FROM that history.
--   * Fairness is derived, never stored: "last asked" = MAX(scheduled_date)
--     over ALL of a member's meeting_questioners rows, including FUTURE
--     already-scheduled meetings (so pre-scheduling several weeks ahead
--     doesn't repeatedly pick the same never-asked-yet person for every one
--     of them). meeting_question_rotation computes this on the fly; the UI's
--     "next up" / "last asked" reads exclusively from it — no TS copy.
--   * meeting_groups / meetings.question_group_number are left in place for
--     this PR (dropped in a follow-up once the backfill notices below are
--     confirmed clean) but the app no longer writes to them.
--
-- Selection logic lives ENTIRELY in SQL (SECURITY DEFINER RPCs) so the admin
-- UI and the non-admin "claim" path trigger the exact same, single-source-of-
-- truth rotation — see meetings_sync_questioners() below. This also fixes a
-- real bug: meetings_update_own's USING (presenter_user_id = auth.uid())
-- evaluates to false (not true) for an unclaimed row (NULL), so a non-admin
-- "claim" via direct table UPDATE silently affects 0 rows while the client
-- still toasts success. meetings_claim() replaces that direct update.

-- 1. Tables -------------------------------------------------------------------
create table if not exists public.meeting_question_pool (
  user_id    uuid primary key references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_questioners (
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  -- FK to user_profiles, not to the pool: leaving the pool must not erase
  -- history that fairness depends on.
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  source      text not null check (source in ('auto', 'manual')),
  assigned_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index if not exists meeting_questioners_user_idx on public.meeting_questioners (user_id);

-- 2. RLS ------------------------------------------------------------------------
-- Both tables: authenticated can read. Writes are admin-only; ordinary users
-- only ever touch meeting_questioners through the SECURITY DEFINER RPCs below
-- (meetings_claim / meetings_sync_questioners), never a direct table write.
alter table public.meeting_question_pool enable row level security;
alter table public.meeting_questioners enable row level security;

create policy "authenticated read meeting_question_pool" on public.meeting_question_pool
  for select to authenticated using (true);
create policy "meetings admin write meeting_question_pool" on public.meeting_question_pool
  for all to authenticated
  using (is_meetings_admin())
  with check (is_meetings_admin());

create policy "authenticated read meeting_questioners" on public.meeting_questioners
  for select to authenticated using (true);
create policy "meetings admin write meeting_questioners" on public.meeting_questioners
  for all to authenticated
  using (is_meetings_admin())
  with check (is_meetings_admin());

-- 3. Grants (mirrors meeting_groups; RLS above is what actually constrains
--    these roles, not the table grants) ------------------------------------
grant delete, insert, references, select, trigger, truncate, update on public.meeting_question_pool to anon;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_question_pool to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_question_pool to service_role;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_questioners to anon;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_questioners to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_questioners to service_role;

-- 4. Rotation view --------------------------------------------------------------
-- SECURITY-CRITICAL: unlike the legacy bento views (baseline:2201, which run
-- as the view owner and bypass RLS on purpose), this view MUST set
-- security_invoker = true — otherwise it would bypass RLS on user_profiles /
-- meetings / meeting_questioners for anyone granted SELECT on it.
create or replace view public.meeting_question_rotation
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

grant select on public.meeting_question_rotation to anon, authenticated, service_role;

-- 5. RPCs -------------------------------------------------------------------

-- Idempotent gap-filler: never reshuffles an existing valid assignment, only
-- evicts a row that now equals the presenter and backfills up to 3 from the
-- rotation view. Called by meetings_claim() and, from TS, after any admin
-- edit / add of a meeting (and by an admin "resync" self-heal button).
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

revoke all on function public.meetings_sync_questioners(uuid) from public;
grant execute on function public.meetings_sync_questioners(uuid) to authenticated, service_role;

-- Non-admin "claim a week" path. Row-locks the meeting to serialize
-- concurrent claims, sets presenter from the caller's own profile, then
-- synchronizes questioners in the same transaction. Replaces the previous
-- direct-UPDATE claim flow, which silently affected 0 rows (see header note).
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

revoke all on function public.meetings_claim(uuid) from public;
grant execute on function public.meetings_claim(uuid) to authenticated;

-- Admin-only manual override: remove one questioner and either install a
-- specific replacement (validated) or auto-pick the deterministic
-- next-in-rotation candidate. Leaves the slot open if the pool is exhausted.
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
    if not exists (select 1 from public.meeting_question_pool where user_id = p_replacement) then
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

revoke all on function public.meetings_replace_questioner(uuid, uuid, uuid) from public;
grant execute on function public.meetings_replace_questioner(uuid, uuid, uuid) to authenticated;

-- 6. Backfill: pool membership from the legacy meeting_groups.members --------
-- Matches user_profiles.name exactly. clock_timestamp() (not now(), which is
-- frozen for the whole transaction) gives strictly increasing created_at
-- values in name order, so the very first rotation is deterministic instead
-- of an arbitrary tie across everyone backfilled in the same instant.
do $$
declare
  v_name       text;
  v_user_id    uuid;
  v_unmatched  text[] := '{}';
begin
  for v_name in
    select distinct member_name
    from (
      select unnest(members) as member_name from public.meeting_groups
    ) all_members
    order by member_name
  loop
    select id into v_user_id
    from public.user_profiles
    where name = v_name
    order by id
    limit 1;

    if v_user_id is not null then
      insert into public.meeting_question_pool (user_id, created_at)
      values (v_user_id, clock_timestamp())
      on conflict (user_id) do nothing;
    else
      v_unmatched := array_append(v_unmatched, v_name);
    end if;
  end loop;

  if cardinality(v_unmatched) > 0 then
    raise notice 'meeting_question_pool backfill: % name(s) not matched to a user_profiles row: %',
      cardinality(v_unmatched), v_unmatched;
  end if;
end $$;

-- 7. Backfill: history warm start ---------------------------------------------
-- For every meeting that had a question_group_number, seed meeting_questioners
-- with that group's name-matched members (excluding that meeting's own
-- presenter) so fairness has real history from day one instead of every
-- member starting tied at "never asked". Intentionally NOT capped at 3 — this
-- is historical record, not the live 3-per-week invariant.
insert into public.meeting_questioners (meeting_id, user_id, source)
select distinct m.id, up.id, 'auto'
from public.meetings m
join public.meeting_groups g on g.group_number = m.question_group_number
join lateral unnest(g.members) as member_name on true
join public.user_profiles up on up.name = member_name
where m.presenter_user_id is null or up.id <> m.presenter_user_id
on conflict (meeting_id, user_id) do nothing;
