-- gallery memories — runs via `supabase test db`.
-- Pins taken_at backfill defaults, MM-DD RPC cover rule, and past-year gate.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated, anon;

select plan(8);

-- ── seed (superuser — bypasses RLS) ──────────────────────────────────────
insert into auth.users (id) values
  ('a1a1a1a1-1111-1111-1111-111111111111'),
  ('b2b2b2b2-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('a1a1a1a1-1111-1111-1111-111111111111', 'alice@test.local', 'Alice', false, '{}'),
  ('b2b2b2b2-2222-2222-2222-222222222222', 'bob@test.local', 'Bob', false, '{}');

-- Same Taipei calendar day, different years. Sequence should collapse to cover.
insert into public.gallery_images (
  id, name, image_path, media_type, created_by, created_at, taken_at,
  sequence_id, sequence_index
) values
  (
    'd4d4d4d4-4444-4444-4444-444444444444',
    'Retreat-0',
    'alice/retreat-0.jpg',
    'image',
    'a1a1a1a1-1111-1111-1111-111111111111',
    '2024-08-10T04:00:00+00',
    '2024-08-10T04:00:00+00',
    'e5e5e5e5-5555-5555-5555-555555555555',
    0
  ),
  (
    'f6f6f6f6-6666-6666-6666-666666666666',
    'Retreat-1',
    'alice/retreat-1.jpg',
    'image',
    'a1a1a1a1-1111-1111-1111-111111111111',
    '2024-08-10T04:05:00+00',
    '2024-08-10T04:05:00+00',
    'e5e5e5e5-5555-5555-5555-555555555555',
    1
  ),
  (
    'a7a7a7a7-7777-7777-7777-777777777777',
    'Solo-2023',
    'bob/solo-2023.jpg',
    'image',
    'b2b2b2b2-2222-2222-2222-222222222222',
    '2023-08-10T02:00:00+00',
    '2023-08-10T02:00:00+00',
    null,
    null
  ),
  (
    'c8c8c8c8-8888-8888-8888-888888888888',
    'Wrong-day',
    'bob/wrong.jpg',
    'image',
    'b2b2b2b2-2222-2222-2222-222222222222',
    '2023-07-01T02:00:00+00',
    '2023-07-01T02:00:00+00',
    null,
    null
  );

-- Current-year shot on the same MM-DD must not appear (not a "memory" yet).
insert into public.gallery_images (
  id, name, image_path, media_type, created_by, created_at, taken_at
) values (
  'b9b9b9b9-9999-9999-9999-999999999999',
  'This-year',
  'alice/this-year.jpg',
  'image',
  'a1a1a1a1-1111-1111-1111-111111111111',
  date_trunc('year', now() at time zone 'Asia/Taipei')
    + interval '7 months' + interval '9 days',
  date_trunc('year', now() at time zone 'Asia/Taipei')
    + interval '7 months' + interval '9 days'
);

-- Force the "this year" row onto Aug 10 Taipei regardless of when CI runs.
update public.gallery_images
set
  taken_at = (
    make_timestamptz(
      extract(year from (now() at time zone 'Asia/Taipei'))::int,
      8,
      10,
      12,
      0,
      0,
      'Asia/Taipei'
    )
  ),
  created_at = (
    make_timestamptz(
      extract(year from (now() at time zone 'Asia/Taipei'))::int,
      8,
      10,
      12,
      0,
      0,
      'Asia/Taipei'
    )
  )
where id = 'b9b9b9b9-9999-9999-9999-999999999999';

-- ── RPC: Aug 10 memories ───────────────────────────────────────────────────
select is(
  (select count(*)::int from public.gallery_memories_on_this_day(8, 10, 50)),
  2,
  'on-this-day returns two past-year covers (sequence collapsed)'
);

select is(
  (
    select id::text
    from public.gallery_memories_on_this_day(8, 10, 50)
    where memory_year = 2024
  ),
  'd4d4d4d4-4444-4444-4444-444444444444',
  'sequence collapses to lowest sequence_index cover'
);

select is(
  (
    select count(*)::int
    from public.gallery_memories_on_this_day(8, 10, 50)
    where id = 'b9b9b9b9-9999-9999-9999-999999999999'
  ),
  0,
  'current-year shots are excluded'
);

select is(
  (
    select count(*)::int
    from public.gallery_memories_on_this_day(8, 10, 50)
    where id = 'c8c8c8c8-8888-8888-8888-888888888888'
  ),
  0,
  'other calendar days are excluded'
);

select is(
  (
    select array_agg(memory_year order by memory_year desc)
    from public.gallery_memories_on_this_day(8, 10, 50)
  ),
  array[2024, 2023]::int[],
  'memories order newest past year first'
);

select is(
  (select count(*)::int from public.gallery_memories_on_this_day(7, 1, 50)),
  1,
  'July 1 returns the matching solo shot'
);

-- Invalid month/day → empty set (not an error)
select is(
  (select count(*)::int from public.gallery_memories_on_this_day(0, 10, 50)),
  0,
  'invalid month yields no rows'
);

select is(
  (select count(*)::int from public.gallery_memories_on_this_day(8, 32, 50)),
  0,
  'invalid day yields no rows'
);

select * from finish();
rollback;
