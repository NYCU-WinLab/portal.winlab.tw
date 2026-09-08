-- gallery search title+tags — runs via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(6);

insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by, sequence_id, sequence_index) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'BBQ night', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 0),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Side shot', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111',
   'e5e5e5e5-5555-5555-5555-555555555555', 1),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Solo desk', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222',
   null, null);

insert into public.gallery_tags (id, name, slug, created_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'Lab trip', 'lab-trip',
   'a1a1a1a1-1111-1111-1111-111111111111');

-- Tag only on non-cover sequence shot.
insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('f6f6f6f6-6666-6666-6666-666666666666', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('BBQ')),
  1,
  'title substring matches the wall cover'
);

select is(
  (select cover_id::text from public.gallery_wall_cover_ids_for_query('BBQ') as cover_id),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'title match returns the cover id'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('lab trip')),
  1,
  'tag name match resolves the sequence cover'
);

select is(
  (select cover_id::text from public.gallery_wall_cover_ids_for_query('lab-trip') as cover_id),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'tag slug match resolves the sequence cover'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('desk')),
  1,
  'solo title match works without a sequence'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('zzzz-missing')),
  0,
  'unknown query returns no covers'
);

select * from finish();
rollback;
