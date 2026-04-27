-- Tighten trip admin scope: signatures are personal data, so the global
-- user_profiles.is_admin flag should NOT silently grant access to other
-- members' saved signatures via trip_admin_get_member_signatures(). Only
-- explicit roles.trip = ["admin"] confers trip admin.

create or replace function public.is_trip_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.roles ? 'trip'
      and up.roles -> 'trip' ? 'admin'
  );
$$;
