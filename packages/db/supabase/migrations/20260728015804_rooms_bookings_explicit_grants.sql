-- The rooms_bookings migration defined RLS policies but relied on Supabase's
-- default privileges for the underlying table grants. Those defaults don't
-- exist in a database built from migrations alone (CI's pgTAP run caught
-- this — every insert failed with "permission denied for table"), and they
-- also hand anon a full INSERT/UPDATE/DELETE grant that only RLS is holding
-- back. Make both explicit: exactly what authenticated needs, nothing for
-- anon.

revoke all on public.rooms_bookings from anon;
grant select, insert, update on public.rooms_bookings to authenticated;
