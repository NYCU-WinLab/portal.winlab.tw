-- Add 潘昊廷 (s415551019) to the presenter roster.
--
-- He has been presenting — 2026-11-23 is his — but was never on the roster, so
-- meetings_fill_presenters has never been able to reach him. His intake year
-- (民國 115) is later than the entire 碩二 cohort (114), which is exactly the
-- case the tier ordering added in 20260830100000 exists for: on the old
-- (admission_year, sort_order) ordering he would sort after every second-year
-- master and land among the first-years.
--
-- Inserted directly rather than through meetings_pool_upsert: that RPC gates on
-- is_meetings_admin(), and a migration runs with no auth.uid() to satisfy it.
-- The append position is computed the same way the RPC would.
--
-- Guarded on the user existing, so this is a no-op on the local and CI
-- databases rather than a foreign-key failure.
insert into public.meeting_presenter_pool (user_id, admission_year, sort_order)
select up.id,
       115,
       coalesce(
         (select max(p.sort_order) from public.meeting_presenter_pool p
          where p.admission_year = 115),
         0
       ) + 1
from public.user_profiles up
where up.username = 's415551019'
on conflict (user_id) do nothing;
