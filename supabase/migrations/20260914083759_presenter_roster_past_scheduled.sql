-- Split "已報告" into what has happened and what is merely on the calendar.
--
-- times_presented used to count every row in meetings carrying this person as
-- presenter, future included — so the moment meetings_fill_presenters assigned
-- next term, the panel claimed people had presented talks they have not given.
-- On prod that read as 洪翊婕 已報告 4 次 when two had happened, and five people
-- showing 1 who had presented none.
--
-- The same split is applied to the questioner rotation in 20260914083537. Note
-- the asymmetry between the two: the questioner ROTATION still orders by a rate
-- whose numerator includes scheduled assignments, because a picker that ignored
-- them would re-pick someone already booked solid. The presenter roster has no
-- such automation — meetings_fill_presenters walks the admin's running order —
-- so here the honest number is the only number needed.
--
-- Redeclared from the definition actually in prod, which is the membership
-- plan's (20260830100000 / 20260830100100) — lab_status and tier_rank are
-- columns 9 and 10 and must stay exactly there. `create or replace view` cannot
-- rename, reorder or retype an existing column, so times_presented_scheduled
-- appends as column 11, and times_presented keeps its bigint.
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
  coalesce(stats.times_presented, 0::bigint) as times_presented,
  up.lab_status,
  public.meetings_tier_rank(up.lab_status) as tier_rank,
  coalesce(stats.times_presented_scheduled, 0)::int as times_presented_scheduled
from public.meeting_presenter_pool p
join public.user_profiles up on up.id = p.user_id
left join (
  select
    m.presenter_user_id as user_id,
    max(m.scheduled_date) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    ) as last_presented_date,
    count(*) filter (
      where m.scheduled_date <= (now() at time zone 'Asia/Taipei')::date
    ) as times_presented,
    count(*) filter (
      where m.scheduled_date > (now() at time zone 'Asia/Taipei')::date
    ) as times_presented_scheduled
  from public.meetings m
  where m.presenter_user_id is not null
  group by m.presenter_user_id
) stats on stats.user_id = p.user_id
order by public.meetings_tier_rank(up.lab_status), p.admission_year, p.sort_order, p.user_id;

grant select on public.meeting_presenter_roster to anon, authenticated, service_role;
