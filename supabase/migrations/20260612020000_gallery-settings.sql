-- Site-wide gallery settings (seasonal themes, etc.). Readable by everyone;
-- writable only by super admins.

create table if not exists public.gallery_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_profiles (id) on delete set null
);

alter table public.gallery_settings enable row level security;

create policy "gallery_settings_select"
  on public.gallery_settings
  for select
  to public
  using (true);

create policy "gallery_settings_insert"
  on public.gallery_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid() and up.is_admin = true
    )
  );

create policy "gallery_settings_update"
  on public.gallery_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid() and up.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid() and up.is_admin = true
    )
  );

insert into public.gallery_settings (key, value)
values ('seasonal_theme', '{"id": null}'::jsonb)
on conflict (key) do nothing;
