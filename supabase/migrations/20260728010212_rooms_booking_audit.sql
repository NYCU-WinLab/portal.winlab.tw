-- Audit trail for bookings/cancellations Portal makes against the CS dept.
-- meeting-room system on the lab's shared account. This table has no
-- bearing on the external system itself — it's how Portal knows which
-- external reservation IDs it created, so cancellation can be restricted to
-- "only what we booked" instead of trusting an arbitrary id from the client.

create table if not exists public.rooms_bookings (
  id uuid primary key default gen_random_uuid(),
  external_reservation_id text not null,
  room text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  requested_by uuid not null references public.user_profiles(id) on delete cascade,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.user_profiles(id)
);

create index if not exists rooms_bookings_date_room
  on public.rooms_bookings (date, room);

create unique index if not exists rooms_bookings_external_id_unique
  on public.rooms_bookings (external_reservation_id);

alter table public.rooms_bookings enable row level security;

-- Everyone in the lab can see what Portal has booked on the shared account —
-- same spirit as the read-only availability calendar itself.
create policy "rooms_bookings_select"
on public.rooms_bookings for select
to authenticated
using (true);

create policy "rooms_bookings_insert_own"
on public.rooms_bookings for insert
to authenticated
with check (requested_by = auth.uid());

-- Only the person who made the booking can cancel it through Portal.
create policy "rooms_bookings_update_own"
on public.rooms_bookings for update
to authenticated
using (requested_by = auth.uid())
with check (requested_by = auth.uid());
