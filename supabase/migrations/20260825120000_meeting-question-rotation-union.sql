-- Widen the questioner rotation candidate set to the UNION of the presenter
-- roster and the (now "extra members only") question pool. Presenters become
-- auto-eligible questioners; meeting_question_pool is where non-presenting
-- extras (e.g. new students) are added. sync/replace RPCs are unchanged —
-- they already read this view. Fixes the "same few people repeat" complaint by
-- enlarging the pool. Keeps security_invoker = true (see 20260706…:78-82).
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
  pool.user_id,
  up.name,
  up.email,
  pool.pool_added_at,
  stats.last_asked_date,
  coalesce(stats.times_asked, 0) as times_asked
from pool
join public.user_profiles up on up.id = pool.user_id
left join (
  select
    mq.user_id,
    max(m.scheduled_date) as last_asked_date,
    count(*) as times_asked
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  group by mq.user_id
) stats on stats.user_id = pool.user_id
order by stats.last_asked_date asc nulls first, pool.pool_added_at asc, pool.user_id asc;

grant select on public.meeting_question_rotation to anon, authenticated, service_role;
