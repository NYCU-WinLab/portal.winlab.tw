-- gallery tag admin rename/merge — runs via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(9);

insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222'),
  ('c3c3c3c3-3333-3333-3333-333333333333');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'cara@test.local', 'Cara', true, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'One', 'alice/1.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'Two', 'bob/2.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222');

insert into public.gallery_tags (id, name, slug, created_by) values
  ('b8b8b8b8-8888-8888-8888-888888888888', 'Lab trip', 'lab-trip',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('c9c9c9c9-9999-9999-9999-999999999999', 'Sunset', 'sunset',
   'b2b2b2b2-2222-2222-2222-222222222222'),
  ('a0a0a0a0-0000-0000-0000-0000000000aa', 'Lab Trip Dup', 'lab-trip-dup',
   'a1a1a1a1-1111-1111-1111-111111111111');

insert into public.gallery_image_tags (image_id, tag_id, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'b8b8b8b8-8888-8888-8888-888888888888',
   'a1a1a1a1-1111-1111-1111-111111111111'),
  ('f6f6f6f6-6666-6666-6666-666666666666', 'a0a0a0a0-0000-0000-0000-0000000000aa',
   'b2b2b2b2-2222-2222-2222-222222222222'),
  -- collision: image already has target when merging
  ('d4d4d4d4-4444-4444-4444-444444444444', 'a0a0a0a0-0000-0000-0000-0000000000aa',
   'a1a1a1a1-1111-1111-1111-111111111111');

-- ── non-admin forbidden ─────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select * from public.gallery_admin_rename_tag(
       'b8b8b8b8-8888-8888-8888-888888888888', 'Renamed'
     ) $$,
  'P0001',
  'Forbidden',
  'non-admin cannot rename tags'
);

select throws_ok(
  $$ select * from public.gallery_admin_merge_tags(
       'a0a0a0a0-0000-0000-0000-0000000000aa',
       'b8b8b8b8-8888-8888-8888-888888888888'
     ) $$,
  'P0001',
  'Forbidden',
  'non-admin cannot merge tags'
);

-- ── admin rename ────────────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"c3c3c3c3-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select results_eq(
  $$ select name, slug from public.gallery_admin_rename_tag(
       'c9c9c9c9-9999-9999-9999-999999999999', 'Golden hour'
     ) $$,
  $$ values ('Golden hour'::text, 'golden-hour'::text) $$,
  'admin can rename a tag and slug updates'
);

select throws_ok(
  $$ select * from public.gallery_admin_rename_tag(
       'c9c9c9c9-9999-9999-9999-999999999999', 'Lab trip'
     ) $$,
  'P0001',
  'A tag with that name already exists',
  'rename refuses slug collision'
);

-- ── admin merge (dedupe collision + move unique) ────────────────────────────
select results_eq(
  $$ select name, slug, moved_count from public.gallery_admin_merge_tags(
       'a0a0a0a0-0000-0000-0000-0000000000aa',
       'b8b8b8b8-8888-8888-8888-888888888888'
     ) $$,
  $$ values ('Lab trip'::text, 'lab-trip'::text, 1::bigint) $$,
  'merge moves unique links and drops colliding ones'
);

select is(
  (select count(*)::int from public.gallery_tags
    where id = 'a0a0a0a0-0000-0000-0000-0000000000aa'),
  0,
  'source tag is deleted after merge'
);

select is(
  (select count(*)::int from public.gallery_image_tags
    where tag_id = 'b8b8b8b8-8888-8888-8888-888888888888'),
  2,
  'target keeps both images after merge'
);

select throws_ok(
  $$ select * from public.gallery_admin_merge_tags(
       'b8b8b8b8-8888-8888-8888-888888888888',
       'b8b8b8b8-8888-8888-8888-888888888888'
     ) $$,
  'P0001',
  'Cannot merge a tag into itself',
  'merge refuses identical source and target'
);

select throws_ok(
  $$ select * from public.gallery_admin_rename_tag(
       'b8b8b8b8-8888-8888-8888-888888888888', '!!!'
     ) $$,
  'P0001',
  'Invalid tag name',
  'rename rejects empty slug after normalize'
);

select * from finish();
rollback;
