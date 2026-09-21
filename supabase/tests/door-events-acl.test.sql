-- door_events ACL regression suite — runs via `supabase test db`.
--
-- 20260921090000 made door_events an admin-read, service-role-write audit
-- table. Two things keep that true and both are single lines a later migration
-- can undo without noticing: the grant set on the table, and the fact that the
-- only policy is a SELECT gated on is_portal_admin(). Pin both.

begin;
create extension if not exists pgtap with schema public;

select plan(6);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.door_events'::regclass),
  'door_events has RLS enabled'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'door_events'),
  1,
  'door_events carries exactly one policy'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'public' and tablename = 'door_events'),
  'SELECT',
  'the one door_events policy is a SELECT — nothing lets authenticated write'
);

-- The policy being a SELECT is not enough: `using (true)` is also a SELECT.
-- Pin the predicate itself, since that is what keeps non-admins out.
select ok(
  (select qual from pg_policies
    where schemaname = 'public' and tablename = 'door_events') like '%is_portal_admin()%',
  'the door_events SELECT policy is gated on is_portal_admin()'
);

-- anon must hold nothing at all; authenticated only SELECT.
select is(
  (select count(*)::int
     from aclexplode((select relacl from pg_class where oid = 'public.door_events'::regclass)) a
    where a.grantee = 'anon'::regrole),
  0,
  'anon holds no privilege on door_events'
);

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from aclexplode((select relacl from pg_class where oid = 'public.door_events'::regclass)) a
    where a.grantee = 'authenticated'::regrole),
  array['SELECT'],
  'authenticated holds SELECT and nothing else on door_events'
);

select * from finish();
rollback;
