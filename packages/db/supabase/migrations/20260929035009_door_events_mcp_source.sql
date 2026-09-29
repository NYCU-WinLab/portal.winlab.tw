-- An agent unlocking the door for a member through the portal MCP server
-- (#1273) is its own source, so the door log never passes it off as a press
-- of the button on /door. It has the web row's shape: a member, an outcome,
-- the caller's address and no card fields.
alter table public.door_events
  drop constraint door_events_source_shape;

alter table public.door_events
  add constraint door_events_source_shape check (
    (
      source in ('web', 'mcp') and user_id is not null and ok is not null
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
  );

comment on column public.door_events.source is
  'web: the /door button. mcp: an agent through /api/mcp, for the member named. card: the physical reader.';
comment on table public.door_events is
  'Unlock attempts from /door (web) and the MCP server (mcp), and physical card '
  'events. Identity is an ingestion-time snapshot, not a foreign key. Only '
  'service_role writes; only door admins read.';
comment on column public.door_events.created_at is
  'Server time for web and mcp unlocks; uncorrected controller time (Asia/Taipei) for card events.';
comment on column public.door_events.ok is
  'For web and mcp: relay acknowledgment. For card: known access granted/denied; NULL for an unclassified device code.';
