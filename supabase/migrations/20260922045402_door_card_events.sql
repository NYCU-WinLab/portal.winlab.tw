alter table public.door_events
  add column source text not null default 'web',
  add column source_event_id text unique,
  add column card_id text,
  add column device_event_code text,
  add column device_reader smallint,
  add column received_at timestamptz,
  alter column user_id drop not null,
  alter column ok drop not null,
  drop constraint door_events_error_iff_failed;

alter table public.door_events
  add constraint door_events_source_shape check (
    (
      source = 'web' and user_id is not null and ok is not null
      and source_event_id is null and card_id is null
      and device_event_code is null and device_reader is null
      and received_at is null
    ) or (
      source = 'card'
      and source_event_id is not null and source_event_id ~ '^[0-9a-f]{64}$'
      and card_id is not null and card_id ~ '^[0-9]{10}$'
      and device_event_code is not null and device_event_code ~ '^[0-9A-F]{4}$'
      and device_reader is not null and device_reader in (1, 2)
      and received_at is not null
      and latency_ms is null and client_address is null and geo_city is null
    )
  ),
  add constraint door_events_error_iff_failed check (
    (ok is true and error is null)
    or (ok is false and error is not null)
    or (ok is null and source = 'card' and error is null)
  );

comment on table public.door_events is
  'Web unlock attempts and physical card events. Identity is an ingestion-time '
  'snapshot, not a foreign key. Only service_role writes; only door admins read.';
comment on column public.door_events.created_at is
  'Server time for web actions; uncorrected controller time (Asia/Taipei) for card events.';
comment on column public.door_events.source_event_id is
  'Stable bridge fingerprint. UNIQUE makes retried deliveries idempotent without relabeling a holder.';
comment on column public.door_events.ok is
  'For web: relay acknowledgment. For card: known access granted/denied; NULL for an unclassified device code.';
comment on column public.door_events.received_at is
  'When the bridge durably received this event, distinct from the controller clock.';

-- Keep the existing admin-only SELECT policy and service-role-only writes.
