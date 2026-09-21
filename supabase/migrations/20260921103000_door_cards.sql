-- /door/admin card management (#1192): the portal becomes the source of truth
-- for the cards enrolled on the lab's Hundure RAC-960PME access controller.
--
-- On 2026-09-21 the controller's card table came back corrupted (it claimed
-- 10,240 cards and only 10 of the 16 real ones were readable) and members lost
-- door access until the list was re-uploaded from the vendor's HAMS desktop
-- software. Nothing outside that Windows machine knew what the list was
-- supposed to contain. These two tables are that knowledge: door_cards is the
-- list we intend the controller to hold, door_card_changes is every attempt to
-- change it.
--
-- The controller itself is reached through the hams-bridge HTTP service on lab
-- infra; Vercel cannot speak its binary TCP protocol. So sync_state is a cache
-- of the last comparison, refreshed by the reconcile action and a daily cron,
-- never something the database can work out on its own.

-- Card management is its own job: whoever hands out cards is not necessarily a
-- portal super admin. Super admins still pass, as they do everywhere else.
create or replace function public.is_door_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.has_role(auth.uid(), 'door', 'admin') or public.is_portal_admin();
$function$;

comment on function public.is_door_admin() is
  'true for members holding roles.door = ["admin"] and for portal super admins. Gates /door/admin and /door/log.';

create table public.door_cards (
  card_id        text primary key,
  holder_name    text not null,
  holder_user_id uuid references public.user_profiles (id) on delete set null,
  note           text,
  sync_state     text not null default 'unknown',
  last_seen_at   timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint door_cards_card_id_format check (card_id ~ '^[0-9]{10}$'),
  constraint door_cards_sync_state_known check (
    sync_state in ('synced', 'missing_on_controller', 'unknown_on_controller', 'unknown')
  )
);

create index door_cards_holder_user_id on public.door_cards (holder_user_id);

comment on table public.door_cards is
  'The card list the lab intends the access controller to hold. card_id is the '
  '10-digit number printed on the card, kept as text because leading zeros are '
  'significant. holder_user_id is optional on purpose: guest and spare cards '
  'have a holder name and no portal account. Written by /door/admin server '
  'actions via service_role only.';
comment on column public.door_cards.sync_state is
  'Result of the last comparison against the controller: synced, '
  'missing_on_controller (we have it, the device does not), '
  'unknown_on_controller (the device has it, we do not) or unknown (never compared).';
comment on column public.door_cards.last_seen_at is
  'When this card was last seen on the controller. Null means never confirmed.';

create table public.door_card_changes (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  card_id        text,
  action         text not null,
  user_id        uuid,
  user_email     text,
  user_name      text not null,
  ok             boolean not null,
  error          text,
  latency_ms     integer,
  detail         jsonb,
  client_address text,
  geo_city       text,
  constraint door_card_changes_action_known check (
    action in ('add', 'update', 'delete', 'import', 'reconcile')
  )
);

create index door_card_changes_created_at on public.door_card_changes (created_at desc);

-- Same reasoning as door_events: the identity columns are a snapshot, not FKs,
-- so the record still says who removed a card after that account is gone. The
-- card_id is loose for the same reason — a delete has to outlive its row in
-- door_cards. user_id is nullable because the nightly cron reconciles with no
-- member behind it.
comment on table public.door_card_changes is
  'One row per attempt to change the controller card list, successful or not. '
  'Identity columns are a snapshot, not FKs; user_id is null for the nightly '
  'reconcile cron. Written by service_role only.';
comment on column public.door_card_changes.detail is
  'Action-specific payload: the before/after values for an edit, the counts the '
  'bridge reported, or the drift a reconcile found.';

alter table public.door_cards enable row level security;
alter table public.door_card_changes enable row level security;

create policy "door admins read door_cards"
  on public.door_cards for select to authenticated
  using (public.is_door_admin());

create policy "door admins read door_card_changes"
  on public.door_card_changes for select to authenticated
  using (public.is_door_admin());

-- Supabase's default privileges would hand anon and authenticated full DML on a
-- new table. SELECT for authenticated is the only grant the policies above
-- need; service_role keeps its default grants because it is the writer.
revoke all on public.door_cards from public, anon, authenticated;
revoke all on public.door_card_changes from public, anon, authenticated;
grant select on public.door_cards to authenticated;
grant select on public.door_card_changes to authenticated;

-- The audit log belongs to the same people who manage the cards, and a door
-- admin who cannot see who opened the door cannot tell a lost card from a
-- borrowed one. Portal super admins keep their access through is_door_admin().
drop policy "portal admins read door_events" on public.door_events;

create policy "door admins read door_events"
  on public.door_events for select to authenticated
  using (public.is_door_admin());
