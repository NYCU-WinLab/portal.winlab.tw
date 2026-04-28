-- Portal-level admin helpers
-- Super admin = user_profiles.is_admin IS TRUE
-- Only super admins can manage other users' roles.

-- ── is_portal_admin() ────────────────────────────────────────────
-- Returns true if the calling user has is_admin = true.
-- Used internally by the RPC functions below; RLS policies can also
-- reference it, but all mutations go through the RPCs.

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- ── portal_admin_get_users() ─────────────────────────────────────
-- Returns every row from user_profiles joined with the auth email.
-- Callers must be a portal admin; the auth.users join is safe because
-- SECURITY DEFINER runs as the function owner (postgres/service role).

create or replace function public.portal_admin_get_users()
returns table (
  id       uuid,
  name     text,
  email    text,
  is_admin boolean,
  roles    jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'permission denied';
  end if;

  return query
  select
    up.id,
    up.name,
    au.email::text,
    coalesce(up.is_admin, false),
    coalesce(up.roles, '{}'::jsonb)
  from public.user_profiles up
  join auth.users au on au.id = up.id
  order by up.name nulls last;
end;
$$;

-- ── portal_admin_update_user() ───────────────────────────────────
-- Updates a target user's roles (JSONB) and is_admin flag.
-- Guards:
--   1. Caller must be a portal admin.
--   2. Caller cannot demote themselves (prevents full lockout).

create or replace function public.portal_admin_update_user(
  p_target_id uuid,
  p_roles     jsonb,
  p_is_admin  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'permission denied';
  end if;

  if p_target_id = auth.uid() and not p_is_admin then
    raise exception 'cannot remove your own super admin status';
  end if;

  update public.user_profiles
  set
    roles    = p_roles,
    is_admin = p_is_admin
  where id = p_target_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

-- ── Seed initial super admins ────────────────────────────────────
-- Sets is_admin = true for the founding accounts.
-- No-op if those accounts haven't signed in yet (user_profiles row
-- is created on first login; run this again after they sign in if needed).

update public.user_profiles
set is_admin = true
where id in (
  select id from auth.users
  where email in (
    'zyx911121@gmail.com',
    'loki.cs14@nycu.edu.tw'
  )
);
