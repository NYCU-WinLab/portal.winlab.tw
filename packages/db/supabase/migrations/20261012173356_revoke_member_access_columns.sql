-- Members stop reading everyone's is_admin and roles.
--
-- 20261012145616 kept both columns in `authenticated`'s column grant because
-- the admin hooks and fourteen RLS policies read them as the caller.
-- 20261012163913 moved all of those onto SECURITY DEFINER helpers and the
-- get_my_access() RPC, so the grant can go: a member learns their own access
-- from get_my_access(), and nobody else's from user_profiles.
--
-- has_role(user_id, app, role) still answers for any user id. That is a
-- deliberate, accepted leftover: it confirms one guess at a time, it cannot
-- list who holds what, and policies need it in that shape.
--
-- is_portal_admin() now backs those policies, so it gets the same hardening
-- the other helpers have: no anon EXECUTE (anon is never an admin, and every
-- anon path that reaches it goes through a definer function running as owner)
-- and an empty search_path.

revoke select (is_admin, roles) on table public.user_profiles from authenticated;

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_portal_admin() from public, anon;
grant execute on function public.is_portal_admin() to authenticated, service_role;
