-- Ranked gallery search — via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(5);

insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by, created_at) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'BBQ night', 'alice/0.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111', '2026-08-01T00:00:00Z'),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Untitled desk', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111', '2026-08-02T00:00:00Z'),
  ('a7a7a7a7-7777-7777-7777-777777777777', 'BBQ', 'alice/2.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111', '2026-07-01T00:00:00Z');

insert into public.gallery_tags (id, name, slug, created_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'BBQ', 'bbq',
   'a1a1a1a1-1111-1111-1111-111111111111');

insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('f6f6f6f6-6666-6666-6666-666666666666', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (
    select array_agg(cover_id::text)
    from public.gallery_wall_cover_ids_for_query('BBQ') as cover_id
  ),
  array[
    'a7a7a7a7-7777-7777-7777-777777777777',
    'd4d4d4d4-4444-4444-4444-444444444444',
    'f6f6f6f6-6666-6666-6666-666666666666'
  ],
  'exact title, then title contains, then tag-only'
);

select is(
  (select cover_id::text from public.gallery_wall_cover_ids_for_query('BBQ') as cover_id limit 1),
  'a7a7a7a7-7777-7777-7777-777777777777',
  'exact title wins first slot'
);

select is(
  (
    select cover_id::text
    from public.gallery_wall_cover_ids_for_query('BBQ') as cover_id
    offset 1 limit 1
  ),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'title substring precedes tag-only match'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('BBQ')),
  3,
  'all three matches still returned'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_query('zzzz-missing')),
  0,
  'unknown query still empty'
);

select * from finish();
rollback;
