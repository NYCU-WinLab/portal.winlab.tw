-- Revoke TRUNCATE / REFERENCES / TRIGGER from anon + authenticated across the
-- public schema, and stop new tables inheriting them via default privileges.
--
-- These three privileges are never reachable through PostgREST and are not
-- gated by RLS (RLS does not apply to TRUNCATE), so leaving them granted let
-- any anon/authenticated caller truncate tables through a SECURITY INVOKER
-- path. SELECT / INSERT / UPDATE / DELETE stay granted and RLS-governed.
--
-- Baseline granted the full set (arwdDxtm) to anon/authenticated in
-- 00000000000000_remote_baseline.sql and new-table migrations kept copying it.

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- Future tables created by postgres (app migrations run as postgres).
-- The supabase_admin default ACL cannot be altered by the migration role, but
-- application tables are created as postgres, so this closes the inheritance.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;
