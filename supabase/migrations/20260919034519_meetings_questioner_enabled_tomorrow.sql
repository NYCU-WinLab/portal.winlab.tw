-- #1176: 「已停用」 means a pause covers tomorrow — the day set_enabled makes
-- every change take effect — not merely that some pause is still open. A pause
-- that starts next month used to read as switched off today, while
-- meetings_questioner_can_serve (which checks paused_on) kept seating the
-- member until then.

create or replace view public.meeting_question_rotation
with (security_invoker = true) as
select
  st.user_id,
  up.name,
  up.email,
  st.joined_on,
  (st.joined_on::timestamp at time zone 'Asia/Taipei') as pool_added_at,
  st.last_asked_date,
  st.times_asked::bigint as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active,
  st.times_asked_scheduled,
  st.opportunities,
  st.rate,
  up.lab_status,
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

-- Switching off a member whose open pause starts after tomorrow brings that
-- pause forward to tomorrow; before, it returned early and the switch did
-- nothing. Otherwise unchanged from 20260918104130.
create or replace function public.meetings_question_pool_set_enabled(
  p_user uuid, p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tomorrow date := (now() at time zone 'Asia/Taipei')::date + 1;
  v_open     date;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理提問成員' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception '缺少啟用狀態' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  if not exists (select 1 from public.meeting_question_pool where user_id = p_user) then
    raise exception '此成員不在提問名冊中' using errcode = 'P0001';
  end if;

  select paused_on into v_open
  from public.meeting_question_pool_pauses
  where user_id = p_user and resumed_on is null;

  if p_enabled then
    if v_open is null then
      return;
    end if;
    if v_open >= v_tomorrow then
      -- Switched off and back on before it took effect: nothing happened.
      delete from public.meeting_question_pool_pauses
      where user_id = p_user and paused_on = v_open;
    else
      update public.meeting_question_pool_pauses
      set resumed_on = v_tomorrow
      where user_id = p_user and paused_on = v_open;
    end if;
  else
    if v_open is not null then
      if v_open > v_tomorrow then
        update public.meeting_question_pool_pauses
        set paused_on = v_tomorrow
        where user_id = p_user and paused_on = v_open;
      end if;
      return;
    end if;
    -- Switched back on today and off again: reopen that span rather than
    -- leaving a zero-length gap between two.
    update public.meeting_question_pool_pauses
    set resumed_on = null
    where user_id = p_user and resumed_on = v_tomorrow;
    if not found then
      insert into public.meeting_question_pool_pauses (user_id, paused_on)
      values (p_user, v_tomorrow);
    end if;
  end if;
end;
$$;
