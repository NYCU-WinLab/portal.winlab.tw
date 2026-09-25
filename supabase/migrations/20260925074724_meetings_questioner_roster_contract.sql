-- #1175: the contract phase of #1174's expand/contract rollout.
--
-- 20260918104130_meetings_questioner_roster (the expand) kept a few things
-- alive only so the frontend deployed at the time kept working while the new
-- one rolled out. The new frontend has been live since, and prod's PostgREST
-- logs show no calls to any of the shims below, so they go:
--
--   * meetings_sync_questioners(uuid)  — a no-op since the expand
--   * meetings_remove_from_pool(uuid)  — forwarded to meetings_question_pool_remove
--   * view meeting_question_pool_members — the old 額外-members list
--   * meeting_question_rotation.pool_added_at — replaced by joined_on
--   * the dryRun / assigned keys in meetings_rebalance_questioners' result
--
-- and the table DML the old panel's direct upsert needed is taken back: every
-- write to meeting_question_pool now goes through SECURITY DEFINER code
-- (meetings_question_pool_add / _remove, the meetings_presenter_pool_to_roster
-- trigger), so authenticated keeps SELECT and the read policy only.
--
-- meeting_presenter_roster.pool_added_at is a different object and stays.

-- ── 1. the RPC shims ───────────────────────────────────────────────────────

drop function if exists public.meetings_sync_questioners(uuid);
drop function if exists public.meetings_remove_from_pool(uuid);

-- ── 2. the views ───────────────────────────────────────────────────────────

-- pool_members selects from the rotation, so it goes first. Nothing else
-- depends on either view (meetings_replace_questioner reads the rotation from
-- plpgsql, by user_id only).
drop view if exists public.meeting_question_pool_members;

-- create or replace view cannot drop a column: recreated from prod's
-- definition (20260919034657's) minus pool_added_at, with the same options
-- and grants.
drop view if exists public.meeting_question_rotation;

create view public.meeting_question_rotation
with (security_invoker = true) as
select
  st.user_id,
  up.name,
  up.email,
  st.joined_on,
  st.last_asked_date,
  st.times_asked::bigint as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active,
  st.times_asked_scheduled,
  st.opportunities,
  st.rate,
  -- The reason behind is_active, for the panel's 「未排程」 hint — the same
  -- column meeting_presenter_roster already exposes.
  up.lab_status,
  -- Off iff a pause covers tomorrow, as the half-open [paused_on, resumed_on)
  -- that meetings_questioner_can_serve uses — tomorrow being the day
  -- set_enabled's changes take effect.
  not exists (
    select 1 from public.meeting_question_pool_pauses z
    where z.user_id = st.user_id
      and z.paused_on <= (now() at time zone 'Asia/Taipei')::date + 1
      and (z.resumed_on is null
           or (now() at time zone 'Asia/Taipei')::date + 1 < z.resumed_on)
  ) as is_enabled,
  exists (
    select 1 from public.meeting_presenter_pool pp where pp.user_id = st.user_id
  ) as is_presenter
from public.meeting_questioner_stats st
join public.user_profiles up on up.id = st.user_id
order by st.rate, st.last_asked_date nulls first, st.joined_on, st.user_id;

revoke all on public.meeting_question_rotation from public, anon, authenticated;
grant select on public.meeting_question_rotation to authenticated, service_role;

-- ── 3. the rebalance result ────────────────────────────────────────────────

-- The reconcile itself still reports dryRun/assigned to its service_role
-- callers; only the user-facing wrapper drops them. Otherwise unchanged from
-- 20260918104130 (and identical to prod).
create or replace function public.meetings_rebalance_questioners(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可重新平衡提問人' using errcode = '42501';
  end if;

  return public.meetings_reconcile_questioners(true, p_dry_run)
    - array['dryRun', 'assigned'];
end;
$$;

-- ── 4. meeting_question_pool table DML ─────────────────────────────────────

drop policy if exists "meetings admin write meeting_question_pool"
  on public.meeting_question_pool;

revoke insert, update, delete on public.meeting_question_pool from anon, authenticated;
