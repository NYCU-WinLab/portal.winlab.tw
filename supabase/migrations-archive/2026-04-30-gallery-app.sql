-- gallery.winlab.tw — public art gallery.
-- Anyone signed in can contribute; each contributor manages only their own
-- uploads (no app-scoped admin role for this one — gallery is community-curated).

create table public.gallery_images (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  image_path  text not null, -- relative path inside the 'gallery' storage bucket
  created_by  uuid not null references public.user_profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index gallery_images_created_at
  on public.gallery_images (created_at desc);
create index gallery_images_created_by
  on public.gallery_images (created_by, created_at desc);

alter table public.gallery_images enable row level security;

-- Read: public — anyone (signed in or anon) can browse the gallery.
create policy "gallery_images_select"
on public.gallery_images for select
using (true);

-- Insert: any signed-in user, but the row must be authored by them.
create policy "gallery_images_insert"
on public.gallery_images for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

-- Update / Delete: only the creator can touch their own rows.
create policy "gallery_images_update"
on public.gallery_images for update
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "gallery_images_delete"
on public.gallery_images for delete
using (created_by = auth.uid());

-- Public bucket — gallery is meant to be browsed without auth.
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- Storage: object name is laid out as `{user_id}/{filename}`. The first
-- folder segment doubles as ownership, which keeps RLS readable and lets
-- us reuse the storage tree for "my uploads" listings later.
create policy "gallery_storage_select"
on storage.objects for select
using (bucket_id = 'gallery');

create policy "gallery_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'gallery'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "gallery_storage_update"
on storage.objects for update
using (
  bucket_id = 'gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "gallery_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
);
