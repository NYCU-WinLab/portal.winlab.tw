-- Who is in the weekly meeting rotation.
--
-- The lab's rule, stated 2026-08-31: **only 碩士生 and 博士生**. Everyone else
-- in the realm — 老師, 助理, 大學部, 校友 — attends, but is not scheduled to
-- present and is not drawn for the questioning group.
--
-- Before this, no SQL knew any of that. The only membership rule lived in
-- TypeScript (isSelectableMember, apps/portal/lib/meetings/lab-status.ts) and
-- guarded exactly ONE thing: the dropdown for adding someone to a pool.
-- meetings_fill_presenters would happily schedule a graduated member a talk
-- next March; meetings_tier_rank merely sorted them last.
--
-- THREE STATES, NOT TWO. This function answers only the first question; the
-- eviction and manual-assignment paths need the second, which is why they spell
-- out `lab_status is not null and not meetings_is_rotation_member(...)` rather
-- than just negating this.
--
--   doctoral, master              in the rotation
--   teacher/assistant/undergrad/  Keycloak has an opinion and it is "not in the
--     alumni                      rotation" — a positive claim about a person
--   NULL                          Keycloak had nothing to say
--
-- NULL IS THE SHARP EDGE, AND IT IS NOT THE SAME AS THE MIDDLE ROW.
--
-- NULL is also what a member gets the morning after they rename themselves in
-- Keycloak: the nightly sync matches on user_profiles.username, which is only
-- refreshed at login (sync_user_profile_username), so the lookup misses and
-- writes NULL. Excluding NULL from NEW assignments is cheap and reverses itself
-- the moment they next sign in. Evicting on it would not: the member is torn
-- out of every future week, and their status coming back does not put the weeks
-- back. So NULL stops you accruing more and costs you nothing you already hold.
--
-- One rename is one changed row — far under checkLabStatusUpdatePlan's 3-row /
-- 20% blast-radius floor, so the guard will not catch it either. The detection
-- is the "有帳號但未同步身分" list on the presenter panel plus
-- lab_status_sync_runs, both shipped alongside this. Do not adopt this predicate
-- somewhere its failure is invisible.
--
-- DELIBERATELY NOT THE SAME AS isSelectableMember. That one also requires a
-- non-empty username outside EXCLUDED_USERNAMES, because it decides who may be
-- ADDED to a pool — a fresh choice, cheap to get wrong, so it fails closed on
-- shell accounts. This one decides what happens to someone an admin has ALREADY
-- put in a pool, where pool membership is itself the human judgement. The two
-- are not meant to converge — resist tidying them into one.
--
-- Plain IMMUTABLE SQL, not SECURITY DEFINER, and granted to anon: it reads no
-- table, and the security_invoker views below call it. Same shape and same
-- reasoning as meetings_tier_rank (20260830100000:43).
create or replace function public.meetings_is_rotation_member(p_status text)
returns boolean
language sql
immutable
parallel safe
as $function$
  -- coalesce because `null in (...)` is NULL, not false, and a NULL here would
  -- make every `where ... and is_active` silently drop the row while every
  -- `where not ...` silently keeps it — the two failure directions at once.
  select coalesce(p_status in ('doctoral', 'master'), false)
$function$;

grant execute on function public.meetings_is_rotation_member(text) to anon, authenticated, service_role;

