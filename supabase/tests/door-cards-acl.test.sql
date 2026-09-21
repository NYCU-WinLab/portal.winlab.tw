-- door_cards / door_card_changes ACL regression suite — runs via `supabase test db`.
--
-- 20260921103000 made both tables door-admin-read, service-role-write, the
-- same shape door_events already has. Three single lines keep that true and a
-- later migration can undo any of them without noticing: the grant set on each
-- table, the fact that the only policy is a SELECT, and the predicate that
-- SELECT is gated on. Pin all three, per table, plus the existence of the
-- is_door_admin() the predicates name.

begin;
create extension if not exists pgtap with schema public;

select plan(15);

select ok(
  (select exists (
     select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_door_admin')),
  'is_door_admin() exists — every policy below names it'
);

-- is_door_admin() is the only thing standing between a member and the card
-- list, and it reads user_profiles, which that member cannot read for anyone
-- but themselves. Without SECURITY DEFINER it silently answers false for
-- everyone; without a pinned search_path it is resolvable through a schema the
-- caller controls.
select ok(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_door_admin'),
  'is_door_admin() is SECURITY DEFINER'
);

select ok(
  (select proconfig from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_door_admin')
    @> array['search_path=public'],
  'is_door_admin() pins search_path to public'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.door_cards'::regclass),
  'door_cards has RLS enabled'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'door_cards'),
  1,
  'door_cards carries exactly one policy'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'public' and tablename = 'door_cards'),
  'SELECT',
  'the one door_cards policy is a SELECT — nothing lets authenticated write'
);

-- The policy being a SELECT is not enough: `using (true)` is also a SELECT.
-- Pin the predicate itself, since that is what keeps non-admins out.
select ok(
  (select qual from pg_policies
    where schemaname = 'public' and tablename = 'door_cards') like '%is_door_admin()%',
  'the door_cards SELECT policy is gated on is_door_admin()'
);

select is(
  (select count(*)::int
     from aclexplode((select relacl from pg_class where oid = 'public.door_cards'::regclass)) a
    where a.grantee = 'anon'::regrole),
  0,
  'anon holds no privilege on door_cards'
);

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from aclexplode((select relacl from pg_class where oid = 'public.door_cards'::regclass)) a
    where a.grantee = 'authenticated'::regrole),
  array['SELECT'],
  'authenticated holds SELECT and nothing else on door_cards'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.door_card_changes'::regclass),
  'door_card_changes has RLS enabled'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'door_card_changes'),
  1,
  'door_card_changes carries exactly one policy'
);

select is(
  (select cmd from pg_policies
    where schemaname = 'public' and tablename = 'door_card_changes'),
  'SELECT',
  'the one door_card_changes policy is a SELECT — the audit trail is append-only to service_role'
);

select ok(
  (select qual from pg_policies
    where schemaname = 'public' and tablename = 'door_card_changes') like '%is_door_admin()%',
  'the door_card_changes SELECT policy is gated on is_door_admin()'
);

select is(
  (select count(*)::int
     from aclexplode((select relacl from pg_class where oid = 'public.door_card_changes'::regclass)) a
    where a.grantee = 'anon'::regrole),
  0,
  'anon holds no privilege on door_card_changes'
);

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from aclexplode((select relacl from pg_class where oid = 'public.door_card_changes'::regclass)) a
    where a.grantee = 'authenticated'::regrole),
  array['SELECT'],
  'authenticated holds SELECT and nothing else on door_card_changes'
);

select * from finish();
rollback;
