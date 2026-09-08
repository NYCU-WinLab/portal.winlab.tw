-- 20260830100500's lab_status guard omits the escape hatch its three siblings
-- (20260817060000, 20260817060100, 20260828120001) all use:
-- `current_setting('role', true) = 'service_role' or auth.uid() is null`.
--
-- It instead wrote `current_setting('role', true) <> 'service_role'` as the
-- ONLY carve-out. Migrations and the Supabase SQL editor both run as
-- `postgres` with no JWT — `current_setting('role', true)` is `postgres`
-- there, not `service_role`, and `auth.uid()` is null. Under the sibling
-- idiom that null-uid clause is what lets a direct, non-application
-- correction through; without it, a future hand-fix of a `lab_status` row
-- run from a migration or the SQL editor would silently no-op, same as
-- editing any other row through those paths always could until now.
--
-- Redeclared whole per this repo's convention (20260817060100's note): not a
-- new migration touching 20260830100500 in place, because that file is
-- already applied to the local dev database — `supabase migration up` does
-- not re-run an already-applied migration, so editing it there would leave
-- the file and the local database disagreeing.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  IF current_setting('my.portal_admin_bypass', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    RAISE EXCEPTION 'Direct modification of roles is not allowed';
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Direct modification of is_admin is not allowed';
  END IF;

  -- Pin, don't raise — see 20260830100500's note on why a momentarily
  -- out-of-step profile save should not turn into a hard error.
  --
  -- service_role is the nightly Keycloak sync's carve-out
  -- (api/cron/kc-lab-status via createAdminClient()). auth.uid() is null is
  -- the migration/SQL-editor carve-out, matching every sibling guard in this
  -- repo: current_setting('role', true) is `postgres`, not `service_role`,
  -- when a migration or the dashboard's SQL editor runs this trigger, so
  -- without this clause a deliberate hand-correction would silently revert
  -- itself.
  IF NEW.lab_status IS DISTINCT FROM OLD.lab_status
     AND current_setting('role', true) <> 'service_role'
     AND auth.uid() IS NOT NULL THEN
    NEW.lab_status := OLD.lab_status;
  END IF;

  RETURN NEW;
END;
$function$;
