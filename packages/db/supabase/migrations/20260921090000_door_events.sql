-- /door audit log (#1183): who pressed the door button, when, and whether the
-- relay answered.
--
-- Until now the only trace of a press was a request span in Sensorium with
-- no user on it. This table is the durable record. The identity columns are a
-- snapshot taken at the time of the press, not foreign keys: an audit row has
-- to keep saying who opened the door after that account is renamed, loses its
-- profile row, or is deleted, and a FK with ON DELETE CASCADE would erase
-- exactly the rows an audit exists for.
--
-- Writes come only from the /door server action through the service-role
-- client. Reads are for portal admins (user_profiles.is_admin), because the
-- rows are about people. Widening that to every member is a product call, not
-- a schema one, and is a one-policy change here.

create table public.door_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  user_id        uuid not null,
  user_email     text,
  user_name      text not null,
  ok             boolean not null,
  error          text,
  latency_ms     integer,
  client_address text,
  geo_city       text,
  constraint door_events_error_iff_failed
    check ((ok and error is null) or (not ok and error is not null))
);

create index door_events_created_at on public.door_events (created_at desc);

comment on table public.door_events is
  'One row per press on /door. Identity columns are a snapshot, not FKs, so the '
  'record outlives the account. Written by the server action via service_role '
  'only; there is deliberately no insert policy for authenticated.';
comment on column public.door_events.ok is
  'true when the relay acknowledged the pulse; false when the device call failed (see error).';
comment on column public.door_events.latency_ms is
  'Wall-clock time of the device round trip as seen from the server action.';

alter table public.door_events enable row level security;

create policy "portal admins read door_events"
  on public.door_events for select to authenticated
  using (public.is_portal_admin());

-- Supabase's default privileges would hand anon and authenticated full DML on a
-- new table. SELECT for authenticated is the only grant the policy above needs;
-- service_role keeps its default grants because it is the writer.
revoke all on public.door_events from public, anon, authenticated;
grant select on public.door_events to authenticated;
