-- Per-restaurant uploaded image menu (a real photo/scan of the shop's menu).
--
-- Stores the public URL on bento_menus and keeps the file in a public
-- 'bento-menus' storage bucket. Uploads/replacements are gated to bento admins
-- (shared, admin-managed content), while anyone can view — mirroring how the
-- rest of bento is world-readable + admin-writable.

alter table public.bento_menus
  add column if not exists menu_image_url text;

-- Public bucket for menu images.
insert into storage.buckets (id, name, public)
values ('bento-menus', 'bento-menus', true)
on conflict (id) do nothing;

-- Anyone can read; only bento admins can write.
create policy "bento_menus_storage_select"
  on storage.objects for select
  using (bucket_id = 'bento-menus');

create policy "bento_menus_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'bento-menus' and has_role(auth.uid(), 'bento', 'admin')
  );

create policy "bento_menus_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'bento-menus' and has_role(auth.uid(), 'bento', 'admin')
  )
  with check (
    bucket_id = 'bento-menus' and has_role(auth.uid(), 'bento', 'admin')
  );

create policy "bento_menus_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'bento-menus' and has_role(auth.uid(), 'bento', 'admin')
  );
