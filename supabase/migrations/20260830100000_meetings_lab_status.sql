-- Lab membership status, mirrored from Keycloak's /lab-member/* subgroups.
--
-- Identity lives in Keycloak (the 2026-08-11 group restructure made
-- /lab-member/{teacher,assistant,doctoral,master,undergrad,alumni} the single
-- source), and until now the portal had no notion of it at all: use-lab-users
-- listed every user_profiles row, so graduated members, shell accounts that
-- were never signed into, and the test account all showed up as candidates for
-- the presenter roster and the question pool.
--
-- Nullable on purpose. NULL means "Keycloak has nothing to say about this
-- person" — a pre-Keycloak shell account, or someone who has left the realm
-- entirely. The candidate filter treats NULL as "not selectable", so an
-- unmapped row fails closed rather than leaking into a roster.
alter table public.user_profiles
  add column if not exists lab_status text;

alter table public.user_profiles
  drop constraint if exists user_profiles_lab_status_check;
alter table public.user_profiles
  add constraint user_profiles_lab_status_check
  check (
    lab_status is null
    or lab_status in ('teacher', 'assistant', 'doctoral', 'master', 'undergrad', 'alumni')
  );

-- Ordering rank for the presenter roster: 博士班 → 碩士 → 大學部.
--
-- This has to be an explicit dimension rather than something derived from
-- admission_year. The roster's old global order was (admission_year,
-- sort_order), which happens to produce 博士 → 碩二 → 碩一 today only because
-- the lab's single doctoral student also has the earliest intake year. A
-- doctoral student admitted later than a master student — a 碩士直升博士, or
-- any of the other four members of /lab-member/doctoral — would sort into the
-- middle of the master cohort.
--
-- Within a tier the order stays (admission_year asc, sort_order asc): seniors
-- first, which for a tier is exactly 年級 high-to-low. Doctoral students order
-- by intake year the same way, so no 年級 arithmetic is needed anywhere.
--
-- Plain IMMUTABLE SQL, not SECURITY DEFINER: it touches no table, so granting
-- it to anon carries no data exposure — and the view below is itself granted to
-- anon, which would break if anon could not execute it.
create or replace function public.meetings_tier_rank(p_status text)
returns integer
language sql
immutable
parallel safe
as $function$
  select case p_status
           when 'doctoral'  then 0
           when 'master'    then 1
           when 'undergrad' then 2
           else 3
         end
$function$;

grant execute on function public.meetings_tier_rank(text) to anon, authenticated, service_role;

-- Roster view: same columns as before plus lab_status and tier_rank.
--
-- The two new columns are APPENDED. `create or replace view` cannot rename or
-- reorder existing columns — inserting them in the middle fails with "cannot
-- change name of view column", and dropping the view first would cascade into
-- its grants.
--
-- security_invoker = true for the same reason as 20260807000000: without it
-- the view hands out user_profiles rows past their RLS.
create or replace view public.meeting_presenter_roster
with (security_invoker = true) as
select
  p.user_id,
  p.admission_year,
  p.sort_order,
  up.name,
  up.email,
  p.created_at as pool_added_at,
  stats.last_presented_date,
  coalesce(stats.times_presented, 0) as times_presented,
  up.lab_status,
  public.meetings_tier_rank(up.lab_status) as tier_rank
from public.meeting_presenter_pool p
join public.user_profiles up on up.id = p.user_id
left join (
  select
    m.presenter_user_id as user_id,
    max(m.scheduled_date) as last_presented_date,
    count(*) as times_presented
  from public.meetings m
  where m.presenter_user_id is not null
  group by m.presenter_user_id
) stats on stats.user_id = p.user_id
order by public.meetings_tier_rank(up.lab_status) asc,
         p.admission_year asc,
         p.sort_order asc,
         p.user_id asc;

grant select on public.meeting_presenter_roster to anon, authenticated, service_role;
