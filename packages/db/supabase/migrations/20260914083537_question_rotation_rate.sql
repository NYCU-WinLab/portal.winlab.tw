-- Both rotation views now read their numbers from meeting_questioner_stats.
--
-- COLUMN ORDER IS NOT NEGOTIABLE. `create or replace view` cannot rename,
-- reorder, retype or drop an existing column, so `is_active` stays exactly
-- where 20260831140200 put it — position 7 — and the three new columns append
-- from position 8. 20260831140200's own header predicted this migration and
-- said so. `times_asked` is cast back to bigint for the same reason: it was
-- count(*) before, and a view column cannot change type in place.
--
-- times_asked and last_asked_date keep their names but change MEANING: they
-- now count only what has already happened, which is what the panels display.
-- rate is what the picker orders by, and it deliberately includes scheduled
-- assignments (see 20260914083508 for why).
create or replace view public.meeting_question_rotation
with (security_invoker = true) as
with pool as (
  select user_id, min(created_at) as pool_added_at
  from (
    select user_id, created_at from public.meeting_question_pool
    union all
    select user_id, created_at from public.meeting_presenter_pool
  ) s
  group by user_id
)
select
  st.user_id,
  up.name,
  up.email,
  st.pool_added_at,
  st.last_asked_date,
  st.times_asked::bigint as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active,
  st.times_asked_scheduled,
  st.opportunities,
  st.rate
from pool p
join public.meeting_questioner_stats st on st.user_id = p.user_id
join public.user_profiles up on up.id = st.user_id
order by st.rate asc,
         st.last_asked_date asc nulls first,
         st.pool_added_at asc,
         st.user_id asc;

grant select on public.meeting_question_rotation to anon, authenticated, service_role;

-- The narrow "額外提問成員" panel view: ONLY meeting_question_pool members, so
-- the panel that manages that table does not list presenter-pool members it
-- cannot remove (20260825120001:66). Same stats, restricted membership, and
-- every row kept — a graduated member has to stay visible in the one place an
-- admin could remove them, which is why is_active exists rather than a filter
-- (20260831140200's header).
create or replace view public.meeting_question_pool_members
with (security_invoker = true) as
select
  st.user_id,
  up.name,
  up.email,
  st.pool_added_at,
  st.last_asked_date,
  st.times_asked::bigint as times_asked,
  public.meetings_is_rotation_member(up.lab_status) as is_active,
  st.times_asked_scheduled,
  st.opportunities,
  st.rate
from public.meeting_question_pool p
join public.meeting_questioner_stats st on st.user_id = p.user_id
join public.user_profiles up on up.id = st.user_id
order by st.rate asc,
         st.last_asked_date asc nulls first,
         st.pool_added_at asc,
         st.user_id asc;

grant select on public.meeting_question_pool_members to anon, authenticated, service_role;
