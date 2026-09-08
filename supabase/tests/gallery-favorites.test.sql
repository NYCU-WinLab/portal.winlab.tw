-- gallery favorites — runs via `supabase test db`.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(10);

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
  ('a7a7a7a7-7777-7777-7777-777777777777', 'Solo', 'bob/solo.jpg', 'image',
   'b2b2b2b2-2222-2222-2222-222222222222',
   null, null);

-- Alice can save Bob's photo
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ insert into public.gallery_favorites (user_id, image_id) values
       ('a1a1a1a1-1111-1111-1111-111111111111', 'a7a7a7a7-7777-7777-7777-777777777777') $$,
  'owner can insert own favorite'
);

select throws_ok(
  $$ insert into public.gallery_favorites (user_id, image_id) values
       ('b2b2b2b2-2222-2222-2222-222222222222', 'a7a7a7a7-7777-7777-7777-777777777777') $$,
  '42501',
  null,
  'cannot insert favorite as another user'
);

select is(
  (select count(*)::int from public.gallery_favorites),
  1,
  'alice sees only her favorites'
);

-- Sequence sibling favorite resolves to cover
select lives_ok(
  $$ insert into public.gallery_favorites (user_id, image_id) values
       ('a1a1a1a1-1111-1111-1111-111111111111', 'f6f6f6f6-6666-6666-6666-666666666666') $$,
  'can favorite a sequence sibling'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_favorites()),
  2,
  'favorites RPC returns two covers'
);

select is(
  (
    select count(*)::int
    from public.gallery_wall_cover_ids_for_favorites() as cover_id
    where cover_id = 'd4d4d4d4-4444-4444-4444-444444444444'
  ),
  1,
  'sequence sibling favorite resolves to cover'
);

select is(
  (
    select count(*)::int
    from public.gallery_wall_cover_ids_for_favorites() as cover_id
    where cover_id = 'a7a7a7a7-7777-7777-7777-777777777777'
  ),
  1,
  'solo favorite is its own cover'
);

-- Bob cannot see Alice's favorites
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.gallery_favorites),
  0,
  'bob cannot read alice favorites'
);

select is(
  (select count(*)::int from public.gallery_wall_cover_ids_for_favorites()),
  0,
  'bob favorites RPC is empty'
);

-- Alice can unsave
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ delete from public.gallery_favorites
     where user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
       and image_id = 'a7a7a7a7-7777-7777-7777-777777777777' $$,
  'owner can delete own favorite'
);

select * from finish();
rollback;
