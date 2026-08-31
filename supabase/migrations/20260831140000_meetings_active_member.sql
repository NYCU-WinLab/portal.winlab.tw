-- Who counts as "currently in the lab", for the meetings automation.
--
-- 20260830100000 taught the portal about Keycloak's /lab-member/* subgroups,
-- but the rule that uses them lives entirely in TypeScript
-- (isSelectableMember, apps/portal/lib/meetings/lab-status.ts:73) and only
-- guards ONE thing: the dropdown for adding someone to a pool. No SQL knows
-- what 'alumni' means. meetings_fill_presenters happily schedules a graduated
-- member a talk next March; meetings_tier_rank just sorts them last.
--
-- NULL IS EXCLUDED TOO, AND THAT IS THE SHARP EDGE.
--
-- NULL means "Keycloak had nothing to say about this person", which is not the
-- same claim as "this person has left". It is also what a member gets the
-- morning after they rename themselves in Keycloak: the nightly sync matches on
-- user_profiles.username, which is only refreshed at login
-- (sync_user_profile_username), so the lookup misses and writes NULL. That
-- member then vanishes from scheduling and from the questioner rotation with no
-- error anywhere, until they next sign in. One rename is one changed row —
-- far under checkLabStatusUpdatePlan's 3-row / 20% blast-radius floor, so the
-- guard will not catch it either.
--
-- Excluding NULL is a deliberate call (2026-08-31): a stale roster silently
-- handing duty to people who left is worse than a member briefly missing, AND
-- the missing member is detectable. The detection is not optional — it is the
-- "有帳號但未同步身分" list on the presenter panel plus lab_status_sync_runs,
-- both shipped alongside this function. Do not adopt this predicate somewhere
-- new without checking that its failure is visible there too.
--
-- DELIBERATELY NOT THE SAME AS isSelectableMember. That one also requires a
-- non-empty username outside EXCLUDED_USERNAMES, because it decides who may be
-- ADDED to a pool — a fresh choice, cheap to get wrong, so it fails closed on
-- shell accounts. This one decides what happens to someone an admin has ALREADY
-- put in a pool. Membership of the pool is itself the human judgement; re-
-- litigating it against username here would drop people for a reason that has
-- nothing to do with whether they are in the lab. The two are not meant to
-- converge — resist tidying them into one.
--
-- Plain IMMUTABLE SQL, not SECURITY DEFINER, and granted to anon: it reads no
-- table, and the security_invoker views below call it. Same shape and same
-- reasoning as meetings_tier_rank (20260830100000:43).
create or replace function public.meetings_is_active_member(p_status text)
returns boolean
language sql
immutable
parallel safe
as $function$
  select p_status is not null and p_status <> 'alumni'
$function$;

grant execute on function public.meetings_is_active_member(text) to anon, authenticated, service_role;
