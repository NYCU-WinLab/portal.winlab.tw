-- gallery album bulk add + wall album cover filter — via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(9);

insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by, sequence_id, sequence_index) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Cover', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 0),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Sibling', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 1),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Solo', 'alice/solo.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   null, null),
  ('b8b8b8b8-8888-8888-8888-888888888888', 'BobSolo', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222',
   null, null);

insert into public.gallery_albums (
  id, title, slug, cover_image_id, created_by
) values (
  'c9c9c9c9-9999-9999-9999-999999999999',
  'Lab Trip',
  'lab-trip',
  null,
  'a1a1a1a1-1111-1111-1111-111111111111'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select is(
  public.gallery_album_add_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array['a7a7a7a7-7777-7777-7777-777777777777']::uuid[]
  ),
  0,
  'non-owner bulk add inserts nothing under RLS'
);

select is(
  (select count(*)::int from public.gallery_album_images
   where album_id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  0,
  'non-owner leave album empty'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select is(
  public.gallery_album_add_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array[
      'f6f6f6f6-6666-6666-6666-666666666666',
      'a7a7a7a7-7777-7777-7777-777777777777'
    ]::uuid[]
  ),
  2,
  'owner can bulk-add multiple photos'
);

select is(
  (select count(*)::int from public.gallery_album_images
   where album_id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  2,
  'two membership rows after bulk add'
);

select is(
  (select cover_image_id::text from public.gallery_albums
   where id = 'c9c9c9c9-9999-9999-9999-999999999999'),
  'f6f6f6f6-6666-6666-6666-666666666666',
  'empty album gets first added photo as cover'
);

select is(
  public.gallery_album_add_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array[
      'f6f6f6f6-6666-6666-6666-666666666666',
      'a7a7a7a7-7777-7777-7777-777777777777'
    ]::uuid[]
  ),
  0,
  'duplicate bulk add is a no-op'
);

-- Wall filter: sibling in album → sequence cover id
select set_eq(
  $$ select * from public.gallery_wall_cover_ids_for_album('lab-trip') $$,
  $$ values
       ('d4d4d4d4-4444-4444-4444-444444444444'::uuid),
       ('a7a7a7a7-7777-7777-7777-777777777777'::uuid)
  $$,
  'album wall filter returns sequence cover + solo'
);

select is_empty(
  $$ select * from public.gallery_wall_cover_ids_for_album('missing-album') $$,
  'unknown album slug returns no covers'
);

select is(
  public.gallery_album_add_images(
    'c9c9c9c9-9999-9999-9999-999999999999',
    array['b8b8b8b8-8888-8888-8888-888888888888']::uuid[]
  ),
  1,
  'owner can add another member photo'
);

select * from finish();
rollback;
