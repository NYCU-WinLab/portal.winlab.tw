-- Door sound regression suite (20260923140000), runs via `supabase test db`.
--
-- Pins: the private door-sounds bucket and its limits; a member uploads only
-- into their own folder and reads nothing back (only the service role reads
-- the bucket); user_profiles.door_sound_path can only point into the row's
-- own folder; the mode is one of three values and needs a file unless it is
-- voice_only; and another member's row does not change.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(21);

insert into auth.users (id) values
  ('71111111-1111-1111-1111-111111111111'),
  ('72222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('71111111-1111-1111-1111-111111111111', 'a@test.local', '詹詠翔', false, '{}'),
  ('72222222-2222-2222-2222-222222222222', 'b@test.local', 'Bob', false, '{}');

-- ── bucket ─────────────────────────────────────────────────────────────────
select is(
  (select public from storage.buckets where id = 'door-sounds'),
  false,
  'door-sounds is a private bucket'
);
select is(
  (select file_size_limit from storage.buckets where id = 'door-sounds'),
  3145728::bigint,
  'door-sounds caps a file at 3 MB'
);
select set_eq(
  $$ select unnest(allowed_mime_types) from storage.buckets
      where id = 'door-sounds' $$,
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg'],
  'door-sounds accepts exactly the five audio types'
);
select is(
  (select door_sound_mode from public.user_profiles
    where id = '71111111-1111-1111-1111-111111111111'),
  'voice_only',
  'a member starts with voice only'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- ── storage: uploads ───────────────────────────────────────────────────────
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds',
       '71111111-1111-1111-1111-111111111111/20260923120000-abcd1234.mp3',
       '71111111-1111-1111-1111-111111111111') $$,
  'a member can upload into their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds',
       '72222222-2222-2222-2222-222222222222/20260923120000-abcd1234.mp3',
       '71111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot upload into another member''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds',
       '71111111-1111-1111-1111-111111111111/nested/x.mp3',
       '71111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot upload into a subfolder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds',
       '71111111-1111-1111-1111-111111111111/x.exe',
       '71111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot upload a file with another extension'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'door-sounds'),
  0::bigint,
  'a member cannot read door sounds, not even their own'
);

-- ── user_profiles: own row ─────────────────────────────────────────────────
select lives_ok(
  $$ update public.user_profiles
      set door_sound_path =
            '71111111-1111-1111-1111-111111111111/20260923120000-abcd1234.mp3',
          door_sound_mode = 'sound_then_voice'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  'a member can point their own row at their own file'
);
select is(
  (select door_sound_mode from public.user_profiles
    where id = '71111111-1111-1111-1111-111111111111'),
  'sound_then_voice',
  'the own-row write is stored'
);
select lives_ok(
  $$ update public.user_profiles set door_sound_mode = 'sound_only'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  'sound_only is a valid mode'
);
select throws_ok(
  $$ update public.user_profiles
      set door_sound_path =
        '72222222-2222-2222-2222-222222222222/20260923120000-abcd1234.mp3'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'the path cannot point into another member''s folder'
);
select throws_ok(
  $$ update public.user_profiles
      set door_sound_path = '71111111-1111-1111-1111-111111111111/x.flac'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'the path must end in an accepted extension'
);
select throws_ok(
  $$ update public.user_profiles
      set door_sound_path = '71111111-1111-1111-1111-111111111111/a/x.mp3'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'the path cannot be nested'
);
select throws_ok(
  $$ update public.user_profiles set door_sound_mode = 'loud'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'an unknown mode is a check violation'
);
select throws_ok(
  $$ update public.user_profiles set door_sound_path = null
      where id = '71111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a mode that plays a file cannot lose its file'
);
select lives_ok(
  $$ update public.user_profiles
      set door_sound_path = null, door_sound_mode = 'voice_only'
      where id = '71111111-1111-1111-1111-111111111111' $$,
  'a member can clear their sound back to voice only'
);

-- ── another member's row ──────────────────────────────────────────────────
-- RLS filters the target row out, so the statement succeeds and touches
-- nothing. Assert on the stored value as the superuser, not on an error.
update public.user_profiles
  set door_sound_path =
        '72222222-2222-2222-2222-222222222222/20260923120000-abcd1234.mp3',
      door_sound_mode = 'sound_only'
  where id = '72222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select door_sound_path from public.user_profiles
    where id = '72222222-2222-2222-2222-222222222222'),
  null,
  'a member cannot set another member''s sound'
);

-- ── anon ───────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('door-sounds',
       '71111111-1111-1111-1111-111111111111/20260923120000-ffff0000.mp3') $$,
  '42501',
  null,
  'anon cannot upload a door sound'
);
reset role;
select is(
  (select count(*) from storage.objects where bucket_id = 'door-sounds'),
  1::bigint,
  'the service role sees the one uploaded sound'
);

select * from finish();
rollback;
