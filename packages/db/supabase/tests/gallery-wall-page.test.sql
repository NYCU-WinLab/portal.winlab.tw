-- gallery_wall_page view — runs via `supabase test db`.
-- Pins the aggregation contract (reaction counts / names, viewer reaction,
-- comment count, uploader name), the per-row filter columns, and the
-- security_invoker + grant boundary: because the view is SECURITY INVOKER,
-- the same query returns each viewer their own my_reaction while still
-- exposing the same public counts to a logged-out visitor.

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns + auth.uid() must be callable after we drop roles.
grant execute on all functions in schema public to authenticated, anon;

select plan(13);

-- ── seed (as superuser — bypasses RLS) ──────────────────────────────────────
insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}');

-- Alice owns an image; Bob owns a video (for the media / uploader filters).
insert into public.gallery_images (id, name, image_path, media_type, created_by) values
  ('c3c3c3c3-3333-3333-3333-333333333333', 'Sunset', 'alice/sunset.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111');
insert into public.gallery_images (id, name, image_path, media_type, poster_path, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Clip', 'bob/clip.mp4', 'video', 'bob/poster.jpg',
   'b2b2b2b2-2222-2222-2222-222222222222');

-- Reactions on Alice's image: Alice 'like' (her own), Bob 'love'.
insert into public.gallery_image_votes (image_id, user_id, reaction) values
  ('c3c3c3c3-3333-3333-3333-333333333333', 'a1a1a1a1-1111-1111-1111-111111111111', 'like'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'b2b2b2b2-2222-2222-2222-222222222222', 'love');

-- One comment on Alice's image.
insert into public.gallery_comments (image_id, body, created_by) values
  ('c3c3c3c3-3333-3333-3333-333333333333', 'nice one', 'b2b2b2b2-2222-2222-2222-222222222222');

-- ── impersonate Alice (owner + viewer) ──────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select is(
  (select (reaction_counts->>'like')::int from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'reaction_counts aggregates the like'
);
select is(
  (select (reaction_counts->>'love')::int from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'reaction_counts aggregates the love'
);
select is(
  (select my_reaction from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  'like',
  'viewer Alice sees her own reaction as my_reaction'
);
select is(
  (select comment_count from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'comment_count aggregates the single comment'
);
select is(
  (select uploader_name from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  'Alice',
  'uploader_name resolves the owner display name'
);
select ok(
  (select reaction_names->'like' ? 'Alice' from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  'reaction_names.like carries the voter display name'
);

-- Per-row filter columns behave (the app applies these via .eq()).
select is(
  (select count(*) from public.gallery_wall_page where media_type = 'video'),
  1::bigint,
  'media_type filter isolates the one video cover'
);
select is(
  (select count(*) from public.gallery_wall_page
   where created_by = 'a1a1a1a1-1111-1111-1111-111111111111'),
  1::bigint,
  'created_by filter isolates the uploader''s cover'
);

-- ── impersonate Bob (different viewer, same row) ────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select is(
  (select my_reaction from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  'love',
  'security_invoker gives Bob his own my_reaction from the same view'
);

-- ── logged-out visitor (anon) ───────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(
  (select my_reaction from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333') is null,
  'anon has no my_reaction (auth.uid() is null)'
);
select is(
  (select (reaction_counts->>'love')::int from public.gallery_wall_page
   where id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'anon still sees the public reaction counts'
);

-- ── grants ──────────────────────────────────────────────────────────────────
reset role;
select ok(
  has_table_privilege('anon', 'public.gallery_wall_page', 'SELECT'),
  'anon can select the wall page view'
);
select ok(
  has_table_privilege('authenticated', 'public.gallery_wall_page', 'SELECT'),
  'authenticated can select the wall page view'
);

select * from finish();
rollback;
