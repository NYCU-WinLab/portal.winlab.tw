-- Trip app: per-trip file uploads (members upload PDFs; admin folders by member).
-- Storage: bucket `trip-files`, path `<trip_id>/<user_id>/<file_id>.pdf`.

-- Helper: is the current user a trip admin?
create or replace function public.is_trip_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'trip' and up.roles -> 'trip' ? 'admin')
      )
  );
$$;

-- Trips
create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  status       text not null default 'open'
                 check (status in ('open','closed')),
  created_by   uuid references public.user_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);

create index trips_status_created
  on public.trips (status, created_at desc);

-- Trip files
create table public.trip_files (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  user_id       uuid references public.user_profiles(id) on delete set null,
  storage_path  text not null,
  filename      text not null,
  description   text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create index trip_files_trip_user
  on public.trip_files (trip_id, user_id, created_at desc);
create index trip_files_user_created
  on public.trip_files (user_id, created_at desc);

-- RLS
alter table public.trips      enable row level security;
alter table public.trip_files enable row level security;

-- trips: any signed-in user can list; only admins write.
create policy "trips_select"
on public.trips for select
using (auth.uid() is not null);

create policy "trips_insert"
on public.trips for insert
with check (public.is_trip_admin());

create policy "trips_update"
on public.trips for update
using (public.is_trip_admin())
with check (public.is_trip_admin());

create policy "trips_delete"
on public.trips for delete
using (public.is_trip_admin());

-- trip_files: members see only their own; admins see all.
create policy "trip_files_select"
on public.trip_files for select
using (
  user_id = auth.uid()
  or public.is_trip_admin()
);

-- members upload as themselves into trips that are open.
create policy "trip_files_insert"
on public.trip_files for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.trips t
    where t.id = trip_id and t.status = 'open'
  )
);

-- members can edit their own description while the trip is open.
create policy "trip_files_update"
on public.trip_files for update
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.trips t
    where t.id = trip_id and t.status = 'open'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.trips t
    where t.id = trip_id and t.status = 'open'
  )
);

-- members can delete their own (open trips); admins can delete anyone's.
create policy "trip_files_delete"
on public.trip_files for delete
using (
  (
    user_id = auth.uid()
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.status = 'open'
    )
  )
  or public.is_trip_admin()
);

-- Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('trip-files', 'trip-files', false)
on conflict (id) do nothing;

-- Storage policies on storage.objects scoped to bucket 'trip-files'.
-- Path layout: <trip_id>/<user_id>/<file_id>.pdf
--   foldername[1] = trip_id, foldername[2] = user_id

create policy "trip_files_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'trip-files'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.trips t
    where t.id::text = (storage.foldername(name))[1]
      and t.status = 'open'
  )
);

create policy "trip_files_storage_select"
on storage.objects for select
using (
  bucket_id = 'trip-files'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_trip_admin()
  )
);

create policy "trip_files_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'trip-files'
  and (
    (
      (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1 from public.trips t
        where t.id::text = (storage.foldername(name))[1]
          and t.status = 'open'
      )
    )
    or public.is_trip_admin()
  )
);
