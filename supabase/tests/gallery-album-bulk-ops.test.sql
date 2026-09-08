-- gallery album bulk remove + sort_position photos RPC — via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(8);

insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Trip-0', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Trip-1', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Trip-2', 'alice/2.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('b8b8b8b8-8888-8888-8888-888888888888', 'BobSolo', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222');

insert into public.gallery_albums (
  id, title, slug, cover_image_id, created_by
) values (
  'c9c9c9c9-9999-9999-9999-999999999999',
  'Lab Trip',
  'lab-trip',
  'd4d4d4d4-4444-4444-4444-444444444444',
  'a1a1a1a1-1111-1111-1111-111111111111'
);

insert into public.gallery_album_images (album_id, image_id, position, added_by) values
  ('c9c9c9c9-9999-9999-9999-999999999999', 'd4d4d4d4-4444-4444-4444-444444444444',
   0, 'a1a1a1a1-1111-1111-1111-111111111111'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'f6f6f6f6-6666-6666-6666-666666666666',
   1, 'a1a1a1a1-1111-1111-1111-111111111111'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'a7a7a7a7-7777-7777-7777-777777777777',
   2, 'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (
    select sort_position
    from public.gallery_album_photos('lab-trip')
    where image_id = 'f6f6f6f6-6666-6666-6666-666666666666'
  ),
  1,
  'gallery_album_photos returns sort_position'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select is(
  public.gallery_album_remove_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array['f6f6f6f6-6666-6666-6666-666666666666']::uuid[]
  ),
  0,
  'non-owner bulk remove deletes nothing under RLS'
);

select is(
  (select count(*)::int from public.gallery_album_images
   where album_id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  3,
  'non-owner leave membership intact'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select is(
  public.gallery_album_remove_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array[
      'd4d4d4d4-4444-4444-4444-444444444444',
      'a7a7a7a7-7777-7777-7777-777777777777'
    ]::uuid[]
  ),
  2,
  'owner can bulk-remove multiple photos'
);

select is(
  (select count(*)::int from public.gallery_album_images
   where album_id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  1,
  'two membership rows remain after bulk remove'
);

select is(
  (select cover_image_id::text from public.gallery_albums
   where id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  'f6f6f6f6-6666-6666-6666-666666666666',
  'cover falls back to remaining photo when cover was removed'
);

select is(
  public.gallery_album_remove_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array['f6f6f6f6-6666-6666-6666-666666666666']::uuid[]
  ),
  1,
  'owner can remove the last photo'
);

select is(
  (select cover_image_id from public.gallery_albums
   where id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  null,
  'empty album clears cover'
);

select * from finish();
rollback;
