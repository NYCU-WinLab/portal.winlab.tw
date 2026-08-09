-- gallery tags — runs via `supabase test db`.
-- Pins catalog + junction RLS, sequence-aware wall cover resolution,
-- and popular-tag listing.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(12);

-- ── seed (superuser — bypasses RLS) ─────────────────────────────────────────
insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222'),
  ('c3c3c3c3-3333-3333-3333-333333333333');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'cara@test.local', 'Cara', true, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by, sequence_id, sequence_index) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Trip-0', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 0),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Trip-1', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 1),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Solo', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222',
   null, null);

insert into public.gallery_tags (id, name, slug, created_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'Lab trip', 'lab-trip',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'Sunset', 'sunset',
   'b2b2b2b2-2222-2222-2222-222222222222');

-- Tag lives on shot 1 (not the cover) so the cover resolver must walk the sequence.
insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('f6f6f6f6-6666-6666-6666-666666666666', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_tag('lab-trip')),
  1,
  'tag on a non-cover sequence shot still resolves the wall cover'
);

select is(
  (select cover_id::text from public.gallery_wall_cover_ids_for_tag('lab-trip') as cover_id),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'resolved cover is the lowest sequence_index row'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_tag('missing-tag')),
  0,
  'unknown slug returns no covers'
);

-- ── Bob (authenticated) collaborative attach + forged created_by ────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select lives_ok(
  $$ insert into public.gallery_image_tags (image_id, tag_id, created_by) values
       ('d4d4d4d4-4444-4444-4444-444444444444', 'c9c9c9c9-9999-9999-9999-999999999999',
        'b2b2b2b2-2222-2222-2222-222222222222') $$,
  'any signed-in member can tag someone else''s image'
);

select lives_ok(
  $$ insert into public.gallery_image_tags (image_id, tag_id, created_by) values
       ('a7a7a7a7-7777-7777-7777-777777777777', 'b8b8b8b8-8888-8888-8888-888888888888',
        'b2b2b2b2-2222-2222-2222-222222222222') $$,
  'image owner can attach an existing tag to their own image'
);

select throws_ok(
  $$ insert into public.gallery_image_tags (image_id, tag_id, created_by) values
       ('a7a7a7a7-7777-7777-7777-777777777777', 'c9c9c9c9-9999-9999-9999-999999999999',
        'a1a1a1a1-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'cannot insert image_tag rows under another user id'
);

select lives_ok(
  $$ delete from public.gallery_image_tags
     where image_id = 'd4d4d4d4-4444-4444-4444-444444444444'
       and tag_id = 'c9c9c9c9-9999-9999-9999-999999999999' $$,
  'tagger can detach their own image_tag'
);

-- ── Alice (owner) can detach tags on her images ─────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ delete from public.gallery_image_tags
     where image_id = 'f6f6f6f6-6666-6666-6666-666666666666'
       and tag_id = 'b8b8b8b8-8888-8888-8888-888888888888' $$,
  'image owner can detach tags on their images'
);

insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('f6f6f6f6-6666-6666-6666-666666666666', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111');

-- ── Cara (admin) can detach anyone's tag ────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"c3c3c3c3-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select lives_ok(
  $$ delete from public.gallery_image_tags
     where image_id = 'f6f6f6f6-6666-6666-6666-666666666666'
       and tag_id = 'b8b8b8b8-8888-8888-8888-888888888888' $$,
  'admin can detach any image_tag'
);

-- ── anon cannot create catalog tags ─────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ insert into public.gallery_tags (name, slug, created_by) values
       ('Nope', 'nope', 'a1a1a1a1-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'anon cannot create tags'
);

reset role;

-- Popular list: solo already has lab-trip; add cover so use_count = 2.
insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (select slug from public.gallery_list_popular_tags(10) limit 1),
  'lab-trip',
  'most-used tag sorts first in popular list'
);

select is(
  (select use_count::int from public.gallery_list_popular_tags(10)
   where slug = 'lab-trip'),
  2,
  'popular list reports use_count'
);

select * from finish();
rollback;
