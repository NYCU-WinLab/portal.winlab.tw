-- Make a stopped Keycloak sync distinguishable from a quiet one.
--
-- The panel's only signal today is an empty state that fires when EVERY
-- lab_status is NULL — it catches "never synced" and nothing else. Once one
-- successful run has happened, a credential rotation, a narrowed client role,
-- or a renamed /lab-member subgroup stops the sync dead and the UI looks
-- exactly as it did the day before, for weeks. Now that lab_status decides who
-- gets scheduled at all (20260831140000), stale data is not a display problem.
--
-- Two instruments, because they fail differently:
--
--   lab_status_sync_runs — did the JOB run, and how did it end. This is the one
--   that catches a run REFUSED by checkLabStatusUpdatePlan's blast-radius
--   guard: that path writes not one user_profiles row, so a per-row timestamp
--   is blind to it, and it is precisely the interesting failure (it means
--   Keycloak just told us most of the lab left).
--
--   user_profiles.lab_status_synced_at — was THIS PERSON seen. "No change" and
--   "not matched" are different facts and the old cron could not tell them
--   apart, because it only wrote rows whose value changed.

alter table public.user_profiles
  add column if not exists lab_status_synced_at timestamptz;

create table if not exists public.lab_status_sync_runs (
  id                  bigint generated always as identity primary key,
  ran_at              timestamptz not null default now(),
  -- ok        = wrote (or had nothing to write)
  -- refused   = ran, but the blast-radius guard rejected the plan
  -- forbidden = Keycloak returned 403 (the read client lost view-users)
  -- unconfigured = env vars missing
  -- error     = anything else, detail carries the message
  status              text not null
    check (status in ('ok', 'refused', 'forbidden', 'unconfigured', 'error')),
  scanned             int not null default 0,
  changed             int not null default 0,
  skipped_no_username int not null default 0,
  detail              text
);

create index if not exists lab_status_sync_runs_ran_at_idx
  on public.lab_status_sync_runs (ran_at desc);

alter table public.lab_status_sync_runs enable row level security;

-- Supabase's default privileges grant anon directly, so RLS alone is not the
-- whole story — revoke the grant as well (same reasoning as
-- 20260828140000_quiz-players-revoke-direct-writes).
revoke all on public.lab_status_sync_runs from public, anon;
grant select on public.lab_status_sync_runs to authenticated;

-- Read-only to every logged-in member; there is deliberately NO insert/update/
-- delete policy, so only service_role (the cron, via createAdminClient) writes.
drop policy if exists lab_status_sync_runs_select on public.lab_status_sync_runs;
create policy lab_status_sync_runs_select
  on public.lab_status_sync_runs
  for select
  to authenticated
  using (true);

-- Redeclared whole from 20260830100600:19. The only change is that
-- lab_status_synced_at is pinned exactly like lab_status.
--
-- Guarding the timestamp matters more than it looks. It is the input to the
-- panel's "上次同步:N 天前" warning, so a member who could write it could make
-- a dead sync read as healthy — disabling the alarm rather than tripping it.
-- Pin, don't raise, for the same reason as lab_status: a profile save carrying
-- a stale copy of the row should not become a hard error.
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

  IF NEW.lab_status_synced_at IS DISTINCT FROM OLD.lab_status_synced_at
     AND current_setting('role', true) <> 'service_role'
     AND auth.uid() IS NOT NULL THEN
    NEW.lab_status_synced_at := OLD.lab_status_synced_at;
  END IF;

  RETURN NEW;
END;
$function$;
