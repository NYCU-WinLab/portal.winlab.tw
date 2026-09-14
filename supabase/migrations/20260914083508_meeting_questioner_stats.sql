-- One place that answers "how much questioning has this person actually done,
-- and how many chances did they have". Both rotation views join it, so the
-- fairness metric cannot drift between the picker and the panel that displays
-- it.
--
-- WHY A RATE AND NOT A DATE.
--
-- The rotation used to order by max(scheduled_date) — "least recently asked
-- first". That is free to violate: being assigned to a week EARLIER than one
-- you already hold does not raise your maximum, so you stay at the top of the
-- list and get picked again for the next earlier week. Prod showed exactly
-- that: 2027-01-04, 01-11 and 01-18 carried the identical trio, all three of
-- whom still read as "last asked 2027-01-18".
--
-- Counting fixes it — every assignment costs one — and dividing by the chances
-- someone actually had is what lets a member who joined in week 12 be compared
-- with one who has been here all year.
--
-- WHY THE DENOMINATOR IS "WEEKS THAT HAVE QUESTIONERS".
--
-- The obvious spelling is a predicate: not a holiday, not a speaker week, has
-- a presenter. That is the same rule meetings_sync_questioners uses to decide
-- whether to staff a week at all — so re-deriving it here would just restate
-- what the data already says, and it gets the pre-pool era wrong: twelve weeks
-- in early 2026 have a presenter but no questioners, because the pool did not
-- exist yet. They are nobody's missed chance.
--
-- The one condition that is NOT in the data: a member cannot question the week
-- they present. Dropping it would inflate the denominator of whoever presents
-- most, lowering their rate and handing them MORE questioning duty — backwards.
create or replace view public.meeting_questioner_stats
with (security_invoker = true) as
with pool as (
  select user_id, min(created_at) as pool_added_at
  from (
    select user_id, created_at from public.meeting_question_pool
    union all
    select user_id, created_at from public.meeting_presenter_pool
  ) s
  group by user_id
),
staffed as (
  select m.id, m.scheduled_date, m.presenter_user_id
  from public.meetings m
  where exists (
    select 1 from public.meeting_questioners q where q.meeting_id = m.id
  )
)
select
  p.user_id,
  p.pool_added_at,
  coalesce(a.times_asked, 0) as times_asked,
  coalesce(a.times_asked_scheduled, 0) as times_asked_scheduled,
  a.last_asked_date,
  coalesce(o.opportunities, 0) as opportunities,
  case
    when coalesce(o.opportunities, 0) = 0 then 0::numeric
    else round(
      (coalesce(a.times_asked, 0) + coalesce(a.times_asked_scheduled, 0))::numeric
        / o.opportunities,
      6
    )
  end as rate
from pool p
left join lateral (
  select count(*)::int as opportunities
  from staffed s
  where s.scheduled_date >= p.pool_added_at::date
    and (s.presenter_user_id is null or s.presenter_user_id <> p.user_id)
) o on true
left join lateral (
  select
    count(*) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    )::int as times_asked,
    count(*) filter (
      where m.scheduled_date > (now() at time zone 'Asia/Taipei')::date
    )::int as times_asked_scheduled,
    max(m.scheduled_date) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    ) as last_asked_date
  from public.meeting_questioners mq
  join public.meetings m on m.id = mq.meeting_id
  where mq.user_id = p.user_id
    and m.scheduled_date >= p.pool_added_at::date
) a on true;

grant select on public.meeting_questioner_stats to anon, authenticated, service_role;
