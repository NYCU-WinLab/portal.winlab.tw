-- Standing meetings: "every Monday 09:00" / "every other Wednesday 14:00".
-- A cron books the next occurrence a week ahead rather than reserving the
-- whole term up front — rooms are first-come-first-served here, so holding
-- a free room for months would be antisocial, and booking one week at a
-- time means each occurrence re-runs the room preference against whatever
-- is actually available.

create table if not exists public.rooms_recurring_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- 0 = Sunday, matching JS getDay().
  weekday smallint not null check (weekday between 0 and 6),
  start_time text not null,
  duration_minutes smallint not null check (duration_minutes between 30 and 300),
  -- 1 = weekly, 2 = fortnightly.
  interval_weeks smallint not null default 1 check (interval_weeks in (1, 2)),
  -- Which occurrence a fortnightly series lands on; ignored when weekly.
  anchor_date date not null,
  attendees jsonb not null default '[]'::jsonb,
  include_advisor boolean not null default true,
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists rooms_recurring_meetings_active
  on public.rooms_recurring_meetings (weekday)
  where active;

-- Ties a booking back to the series that produced it, so a cancelled or
-- failed occurrence can be traced without guessing from title and time.
alter table public.rooms_bookings
  add column if not exists recurring_id uuid
    references public.rooms_recurring_meetings(id) on delete set null;

alter table public.rooms_recurring_meetings enable row level security;

-- Explicit, not inherited from Supabase defaults: a database built from
-- these migrations alone has no default privileges, and the defaults would
-- also hand anon a write grant held back only by RLS.
revoke all on public.rooms_recurring_meetings from anon;
grant select, insert, update, delete on public.rooms_recurring_meetings to authenticated;

-- The whole lab can see the standing meetings; only the person who set one
-- up can change or remove it.
create policy "rooms_recurring_select"
on public.rooms_recurring_meetings for select
to authenticated
using (true);

create policy "rooms_recurring_insert_own"
on public.rooms_recurring_meetings for insert
to authenticated
with check (created_by = auth.uid());

create policy "rooms_recurring_update_own"
on public.rooms_recurring_meetings for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "rooms_recurring_delete_own"
on public.rooms_recurring_meetings for delete
to authenticated
using (created_by = auth.uid());
