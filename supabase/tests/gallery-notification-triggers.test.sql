-- gallery notification triggers — runs via `supabase test db`.
-- Pins reaction / reply / comment_like / @mention fan-out into
-- gallery_activity_notifications + gallery_comment_mentions from the
-- source-table writes (no app admin client), plus the RLS insert lock
-- (authenticated cannot forge notification rows).

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(16);

-- ── seed ────────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222'),
  ('c3c3c3c3-3333-3333-3333-333333333333');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}'),
  ('c3c3c3c3-3333-3333-3333-333333333333', 'cara@test.local', 'Cara', false, '{}');

insert into public.gallery_images (id, name, image_path, media_type, created_by) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'Sunset', 'alice/sunset.jpg', 'image',
   'a1a1a1a1-1111-1111-1111-111111111111');

-- ── reaction: Bob reacts to Alice's image → Alice gets a notification ───────
insert into public.gallery_image_votes (image_id, user_id, reaction) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'b2b2b2b2-2222-2222-2222-222222222222', 'love');

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'reaction'
     and image_id = 'd4d4d4d4-4444-4444-4444-444444444444'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'
     and recipient_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
     and reaction = 'love'
     and read_at is null),
  1,
  'reaction insert fans out an unread notification to the image owner'
);

-- Self-reaction does not notify.
insert into public.gallery_image_votes (image_id, user_id, reaction) values
  ('d4d4d4d4-4444-4444-4444-444444444444', 'a1a1a1a1-1111-1111-1111-111111111111', 'like');

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'reaction'
     and actor_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  0,
  'self-reaction does not create a notification'
);

-- Reaction change updates the unread row in place.
update public.gallery_image_votes
set reaction = 'cheers'
where image_id = 'd4d4d4d4-4444-4444-4444-444444444444'
  and user_id = 'b2b2b2b2-2222-2222-2222-222222222222';

select is(
  (select reaction from public.gallery_activity_notifications
   where kind = 'reaction'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'
     and recipient_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  'cheers',
  'reaction update refreshes the unread notification emoji'
);

-- Removing the reaction clears the unread notification.
delete from public.gallery_image_votes
where image_id = 'd4d4d4d4-4444-4444-4444-444444444444'
  and user_id = 'b2b2b2b2-2222-2222-2222-222222222222';

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'reaction'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'
     and recipient_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  0,
  'reaction delete removes the unread notification'
);

-- ── reply + mentions ────────────────────────────────────────────────────────
insert into public.gallery_comments (id, image_id, body, created_by) values
  ('e5e5e5e5-5555-5555-5555-555555555555',
   'd4d4d4d4-4444-4444-4444-444444444444',
   'hello from Alice',
   'a1a1a1a1-1111-1111-1111-111111111111');

insert into public.gallery_comments (id, image_id, parent_id, body, created_by) values
  ('f6f6f6f6-6666-6666-6666-666666666666',
   'd4d4d4d4-4444-4444-4444-444444444444',
   'e5e5e5e5-5555-5555-5555-555555555555',
   'hi @Alice and @Cara from Bob',
   'b2b2b2b2-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'reply'
     and comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and recipient_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'),
  1,
  'reply insert notifies the parent comment author'
);

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and mentioned_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  1,
  'reply body @Alice creates a mention row'
);

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and mentioned_user_id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'reply body @Cara creates a mention row'
);

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and mentioned_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'),
  0,
  'author is never mentioned for their own @Name'
);

-- Edit removes stale mention and keeps Cara.
update public.gallery_comments
set body = 'only @Cara now'
where id = 'f6f6f6f6-6666-6666-6666-666666666666';

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and mentioned_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  0,
  'editing out @Alice removes the stale mention'
);

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'
     and mentioned_user_id = 'c3c3c3c3-3333-3333-3333-333333333333'),
  1,
  'editing keeps the still-mentioned @Cara row'
);

-- Clearing all mentions empties the set.
update public.gallery_comments
set body = 'no tags left'
where id = 'f6f6f6f6-6666-6666-6666-666666666666';

select is(
  (select count(*)::int from public.gallery_comment_mentions
   where comment_id = 'f6f6f6f6-6666-6666-6666-666666666666'),
  0,
  'editing out every @mention clears gallery_comment_mentions'
);

-- ── comment like ────────────────────────────────────────────────────────────
insert into public.gallery_comment_likes (comment_id, user_id) values
  ('e5e5e5e5-5555-5555-5555-555555555555', 'b2b2b2b2-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'comment_like'
     and comment_id = 'e5e5e5e5-5555-5555-5555-555555555555'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'
     and recipient_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  1,
  'comment like notifies the comment author'
);

delete from public.gallery_comment_likes
where comment_id = 'e5e5e5e5-5555-5555-5555-555555555555'
  and user_id = 'b2b2b2b2-2222-2222-2222-222222222222';

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'comment_like'
     and comment_id = 'e5e5e5e5-5555-5555-5555-555555555555'
     and actor_user_id = 'b2b2b2b2-2222-2222-2222-222222222222'),
  0,
  'unlike removes the unread comment_like notification'
);

-- Self-like does not notify.
insert into public.gallery_comment_likes (comment_id, user_id) values
  ('e5e5e5e5-5555-5555-5555-555555555555', 'a1a1a1a1-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.gallery_activity_notifications
   where kind = 'comment_like'
     and actor_user_id = 'a1a1a1a1-1111-1111-1111-111111111111'),
  0,
  'self-like does not create a notification'
);

-- ── RLS: authenticated cannot forge activity notifications ──────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.gallery_activity_notifications (
       recipient_user_id, kind, image_id, actor_user_id, reaction
     ) values (
       'a1a1a1a1-1111-1111-1111-111111111111',
       'reaction',
       'd4d4d4d4-4444-4444-4444-444444444444',
       'b2b2b2b2-2222-2222-2222-222222222222',
       'love'
     ) $$,
  '42501',
  NULL,
  'authenticated cannot INSERT gallery_activity_notifications (trigger-only writes)'
);

select throws_ok(
  $$ insert into public.gallery_comment_mentions (comment_id, mentioned_user_id)
     values (
       'e5e5e5e5-5555-5555-5555-555555555555',
       'c3c3c3c3-3333-3333-3333-333333333333'
     ) $$,
  '42501',
  NULL,
  'authenticated cannot INSERT gallery_comment_mentions (trigger-only writes)'
);

select * from finish();
rollback;
