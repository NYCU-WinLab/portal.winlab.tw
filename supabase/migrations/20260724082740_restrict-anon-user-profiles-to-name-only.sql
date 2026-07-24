-- The "Anonymous can view all user names" RLS policy on public.user_profiles
-- has USING (true) — by design, intended to let logged-out visitors (e.g. the
-- gallery photo wall) see member display names. But RLS is row-level only:
-- with a blanket `grant ... on user_profiles to anon`, that row-level "true"
-- exposed EVERY column to anyone with no login at all — email, is_admin,
-- roles, claude_session_id, active_workflow, line_user_id, telegram_user_id,
-- discord_user_id. Verified live-exploitable via a plain curl against the
-- PostgREST endpoint with only the public anon key.
--
-- Fix: column-level grant, restricted to what the policy's own name says it's
-- for (id + name). The RLS policy itself (USING true, anon role) is untouched
-- since some legitimate anon-facing feature clearly depends on name lookups;
-- this only narrows which columns that access can reach.
revoke all on public.user_profiles from anon;
grant select (id, name) on public.user_profiles to anon;
