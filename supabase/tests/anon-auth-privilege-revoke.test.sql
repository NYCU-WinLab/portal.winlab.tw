-- TRUNCATE / REFERENCES / TRIGGER revoke regression suite — `supabase test db`.
--
-- 20260902045740_revoke-anon-auth-truncate.sql takes these three privileges
-- away from anon and authenticated across the whole public schema. Without an
-- assertion pinning that, the revoke is a single line one future migration can
-- silently undo — which is exactly what happened to the function grants in
-- #1104, and what rls.test.sql:175-190 was written to stop for
-- rooms_meeting_requests. The baseline granted the full arwdDxtm set to
-- anon/authenticated on every table, and new-table migrations kept copying the
-- pattern, so "someone re-adds it without noticing" is the documented failure
-- mode here, not a hypothetical one.
--
-- These read the ACL schema-wide rather than table by table: a per-table list
-- would go stale the moment a table is added, and it is the schema-wide
-- property the migration actually claims.

begin;
create extension if not exists pgtap with schema public;

select plan(14);

-- ── 1-6. no public relation hands anon or authenticated these three ────────
-- Covers views and materialised views too (relkind v/m), which carry the same
-- baseline grants and which `revoke ... on all tables` also reaches.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'TRUNCATE')),
  0,
  'no public relation grants anon TRUNCATE'
);
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'REFERENCES')),
  0,
  'no public relation grants anon REFERENCES'
);
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, 'TRIGGER')),
  0,
  'no public relation grants anon TRIGGER'
);
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE')),
  0,
  'no public relation grants authenticated TRUNCATE'
);
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, 'REFERENCES')),
  0,
  'no public relation grants authenticated REFERENCES'
);
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, 'TRIGGER')),
  0,
  'no public relation grants authenticated TRIGGER'
);

-- ── 7-8. the revoke was surgical, not a blanket lockout ────────────────────
-- Without these, a future migration could "fix" a failure above by revoking
-- everything from everyone and the suite would still pass.
select ok(
  has_table_privilege('service_role', 'public.user_profiles', 'TRUNCATE'),
  'service_role keeps TRUNCATE — the trusted backend key is deliberately untouched'
);
select ok(
  has_table_privilege('authenticated', 'public.user_profiles', 'SELECT'),
  'authenticated keeps SELECT — DML stays granted and RLS-governed'
);

-- ── 9-10. new tables do not inherit the three back ─────────────────────────
-- This is the half of the migration that `alter default privileges for role
-- postgres` is responsible for. Migrations run as postgres, so a table created
-- here takes the same path an app table takes. If the local stack does not
-- reproduce the platform's default ACL these pass without proving much, but
-- they can never fail for the wrong reason — and against a database that does
-- carry it, they are the only thing that catches the inheritance coming back.
reset role;
create table public.pgtap_default_privilege_probe (id int primary key);

select ok(
  not has_table_privilege('anon', 'public.pgtap_default_privilege_probe', 'TRUNCATE'),
  'a newly created table does not hand anon TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.pgtap_default_privilege_probe', 'TRIGGER'),
  'a newly created table does not hand authenticated TRIGGER'
);

-- ── 11-14. #1144: the questioner tables hand anon no DML ──────────────────
-- Named table by table rather than schema-wide, unlike everything above: this
-- is not a property of the whole schema (authenticated legitimately holds the
-- same privileges here, governed by RLS), it is a property of three tables
-- whose writes now rewrite the future schedule. 20260915000003 explains why.
select is(
  (select count(*)::int
     from unnest(array['public.meeting_question_pool',
                       'public.meeting_presenter_pool',
                       'public.meeting_questioners']) t(rel)
    where has_table_privilege('anon', t.rel, 'INSERT')
       or has_table_privilege('anon', t.rel, 'UPDATE')
       or has_table_privilege('anon', t.rel, 'DELETE')),
  0,
  'anon holds no INSERT/UPDATE/DELETE on any of the three questioner tables'
);

-- The counter-assertions. Without them a future migration could satisfy the
-- line above by revoking these tables from everyone, and the admin panel would
-- stop working with the suite still green.
select ok(
  has_table_privilege('authenticated', 'public.meeting_question_pool', 'INSERT'),
  'authenticated keeps INSERT on meeting_question_pool — RLS is what gates it'
);
select ok(
  has_table_privilege('authenticated', 'public.meeting_presenter_pool', 'DELETE'),
  'authenticated keeps DELETE on meeting_presenter_pool — RLS is what gates it'
);
select ok(
  has_table_privilege('anon', 'public.meeting_question_pool', 'SELECT'),
  'anon keeps SELECT — deliberately left, and empty under RLS either way'
);

select * from finish();
rollback;
