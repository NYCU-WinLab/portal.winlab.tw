-- gallery albums — runs via `supabase test db`.
-- Pins catalog + membership RLS, list/photos RPCs, and ownership gates.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(14);

-- ── seed (superuser — bypasses RLS) ─────────────────────────────────────────
insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222'),
  ('c3c3c3c3-3333-3333-3333-333333333333');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'cara@test.local', 'Cara', true, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Trip-0', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Trip-1', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Solo', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222');

insert into public.gallery_albums (id, title, slug, description, created_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'Lab Trip', 'lab-trip',
   'Retreat shots', 'a1a1a1a1-1111-1111-1111-111111111111');

insert into public.gallery_album_images (album_id, image_id, position, added_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'd4d4d4d4-4444-4444-4444-444444444444',
   0, 'a1a1a1a1-1111-1111-1111-111111111111'),
  ('b8b8b8b8-8888-8888-8888-888888888888', 'f6f6f6f6-6666-6666-6666-666666666666',
   1, 'a1a1a1a1-1111-1111-1111-111111111111');

-- ── list + photos RPCs (security invoker, readable by anyone) ───────────────
select is(
  (select count(*)::int from public.gallery_list_albums(10)),
  1,
  'list albums returns seeded album'
);

select is(
  (select slug from public.gallery_list_albums(10) limit 1),
  'lab-trip',
  'list albums exposes slug'
);

select is(
  (select photo_count::int from public.gallery_list_albums(10)
   where slug = 'lab-trip'),
  2,
  'list albums reports photo_count'
);

select is(
  (select count(*)::int from public.gallery_album_photos('lab-trip')),
  2,
  'album photos RPC returns membership'
);

select is(
  (select image_id::text from public.gallery_album_photos('lab-trip') limit 1),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'album photos respect position order'
);

-- ── Bob cannot mutate Alice's album membership ──────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.gallery_album_images (album_id, image_id, position, added_by) values
       ('b8b8b8b8-8888-8888-8888-888888888888', 'a7a7a7a7-7777-7777-7777-777777777777',
        2, 'b2b2b2b2-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'non-owner cannot add photos to someone else''s album'
);

select throws_ok(
  $$ update public.gallery_albums
     set title = 'Hijacked'
     where id = 'b8b8b8b8-8888-8888-8888-888888888888' $$,
  '42501',
  null,
  'non-owner cannot rename someone else''s album'
);

select lives_ok(
  $$ insert into public.gallery_albums (id, title, slug, created_by) values
       ('c9c9c9c9-9999-9999-9999-999999999999', 'Bob Album', 'bob-album',
        'b2b2b2b2-2222-2222-2222-222222222222') $$,
  'signed-in member can create their own album'
);

select lives_ok(
  $$ insert into public.gallery_album_images (album_id, image_id, position, added_by) values
       ('c9c9c9c9-9999-9999-9999-999999999999', 'a7a7a7a7-7777-7777-7777-777777777777',
        0, 'b2b2b2b2-2222-2222-2222-222222222222') $$,
  'owner can add photos to their own album'
);

select throws_ok(
  $$ insert into public.gallery_album_images (album_id, image_id, position, added_by) values
       ('c9c9c9c9-9999-9999-9999-999999999999', 'd4d4d4d4-4444-4444-4444-444444444444',
        1, 'a1a1a1a1-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'cannot insert album_image rows under another user id'
);

-- ── Alice (owner) can remove her membership rows ────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ delete from public.gallery_album_images
     where album_id = 'b8b8b8b8-8888-8888-8888-888888888888'
       and image_id = 'f6f6f6f6-6666-6666-6666-666666666666' $$,
  'album owner can remove photos'
);

-- ── Cara (admin) can delete any album ───────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"c3c3c3c3-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select lives_ok(
  $$ delete from public.gallery_albums
     where id = 'c9c9c9c9-9999-9999-9999-999999999999' $$,
  'admin can delete any album'
);

-- ── anon cannot create albums ───────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ insert into public.gallery_albums (title, slug, created_by) values
       ('Nope', 'nope', 'a1a1a1a1-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'anon cannot create albums'
);

reset role;

select is(
  (select count(*)::int from public.gallery_list_albums(10)
   where slug = 'lab-trip'),
  1,
  'alice album still listed after membership edit'
);

select * from finish();
rollback;
