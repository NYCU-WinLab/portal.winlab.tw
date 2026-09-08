-- lab_status is a new authority column with no write guard.
--
-- user_profiles_update_own grants UPDATE ... USING (auth.uid() = id) — every
-- authenticated member may update their own row. prevent_role_escalation
-- (BEFORE UPDATE on user_profiles) pins only `roles` and `is_admin`, and
-- `authenticated` holds table-level UPDATE, so lab_status was left wide open.
--
-- lab_status is now the FIRST ordering key of meeting_presenter_roster and of
-- meetings_fill_presenters. A member could PATCH their own row to
-- {"lab_status":"doctoral"}, jump to the head of the roster, and have the next
-- "自動排定報告人" hand them the earliest open week. The nightly cron reverts
-- the column within a day, but it does not revert the schedule that was
-- already written from the forged value.
--
-- Fixed by redeclaring prevent_role_escalation() whole (this repo's
-- convention — see 20260817060000's note on why column-level revoke can't do
-- this: `authenticated` holds table-level UPDATE, and a column REVOKE against
-- a table-level GRANT is a no-op) with one added clause. Not a new migration
-- of 20260830100000_meetings_lab_status.sql: that file is unapplied in
-- production but already applied to the local dev database, so editing it in
-- place would leave the file and the local database disagreeing — `supabase
-- migration up` does not re-run an already-applied migration, so the guard
-- could silently never exist anywhere.
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

  -- Pin, don't raise. meetings_guard_columns uses the same pin-silently
  -- pattern for slot fields it doesn't want a caller touching. Raising here
  -- would turn an unrelated profile save (e.g. changing `name`) into a hard
  -- error for anyone whose row happens to be momentarily out of step with
  -- Keycloak — the write should just quietly not move lab_status.
  --
  -- service_role is the deliberate carve-out: the nightly Keycloak sync
  -- (api/cron/kc-lab-status) writes through createAdminClient(), which
  -- authenticates as service_role and must still be able to update this
  -- column. Nothing else runs as service_role from a member's browser.
  IF NEW.lab_status IS DISTINCT FROM OLD.lab_status
     AND current_setting('role', true) <> 'service_role' THEN
    NEW.lab_status := OLD.lab_status;
  END IF;

  RETURN NEW;
END;
$function$;
