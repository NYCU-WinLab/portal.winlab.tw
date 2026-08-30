-- Redeclared whole from 20260807000000:236. The ONLY change is the neighbour
-- lookup, which now requires the same tier as well as the same intake year.
--
-- Until the roster gained a tier dimension, "same admission_year" and "same
-- displayed group" were the same thing — every intake year held exactly one
-- programme. A doctoral student admitted the same year as a cohort of master
-- students breaks that: the old lookup would trade sort_order with whichever
-- master happened to sit at position ± 1, which moves nobody on screen (the
-- two are in different tiers) and leaves the button looking broken.
create or replace function public.meetings_pool_move(p_user uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row       public.meeting_presenter_pool;
  v_neighbour public.meeting_presenter_pool;
  v_tier      integer;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理報告順位' using errcode = '42501';
  end if;

  if p_delta not in (-1, 1) then
    raise exception '一次只能移動一個位置' using errcode = 'P0001';
  end if;

  select * into v_row from public.meeting_presenter_pool where user_id = p_user;
  if not found then
    raise exception '此成員不在報告順位名單中' using errcode = 'P0001';
  end if;

  -- Two admins reordering the same cohort would otherwise each hold one row
  -- and wait on the other's — a deadlock, surfaced as a raw 40P01. One lock
  -- per cohort makes reorders take turns instead.
  perform pg_advisory_xact_lock(
    hashtext('meetings_presenter_pool:' || v_row.admission_year::text)
  );

  select public.meetings_tier_rank(up.lab_status) into v_tier
  from public.user_profiles up
  where up.id = p_user;

  -- Nearest same-tier neighbour in the direction of travel, rather than
  -- whoever literally holds sort_order ± 1: a member of another tier sitting
  -- between the two is not a neighbour, and skipping over them is what makes
  -- the button move what the admin can actually see.
  select p.* into v_neighbour
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where p.admission_year = v_row.admission_year
    and public.meetings_tier_rank(up.lab_status) = v_tier
    and case when p_delta = -1
             then p.sort_order < v_row.sort_order
             else p.sort_order > v_row.sort_order
        end
  order by case when p_delta = -1 then -p.sort_order else p.sort_order end
  limit 1;

  if not found then
    -- Already at the edge of the tier. Not an error: the button being a
    -- no-op is friendlier than a toast for something the UI should have
    -- disabled anyway.
    return;
  end if;

  -- Deferred so the two rows can trade positions in one statement each without
  -- transiently colliding on (admission_year, sort_order).
  set constraints meeting_presenter_pool_position_uniq deferred;

  update public.meeting_presenter_pool
  set sort_order = v_row.sort_order
  where user_id = v_neighbour.user_id;

  update public.meeting_presenter_pool
  set sort_order = v_neighbour.sort_order
  where user_id = v_row.user_id;

  set constraints meeting_presenter_pool_position_uniq immediate;
end;
$function$;

revoke all on function public.meetings_pool_move(uuid, integer) from public, anon;
grant execute on function public.meetings_pool_move(uuid, integer) to authenticated;
