-- Default door sounds regression suite (20260929100000), runs via
-- `supabase test db`.
--
-- Pins: only door admins read or write door_default_sounds; path and
-- created_by are write-once; the label and path checks; door admins upload
-- only into defaults/ and members not at all; and a member still cannot point
-- their own greeting at a default file.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(18);

insert into auth.users (id) values
  ('81111111-1111-1111-1111-111111111111'),
  ('82222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('81111111-1111-1111-1111-111111111111', 'door@test.local', 'Door Admin',
    false, '{"door": ["admin"]}'),
  ('82222222-2222-2222-2222-222222222222', 'm@test.local', 'Member',
    false, '{}');
insert into public.door_default_sounds (label, path) values
  ('existing', 'defaults/20260929000000-00000000.mp3');

select is(
  (select relrowsecurity from pg_class
    where oid = 'public.door_default_sounds'::regclass),
  true,
  'door_default_sounds has RLS enabled'
);

-- ── member ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.door_default_sounds),
  0::bigint,
  'a member cannot see the default sounds'
);
select throws_ok(
  $$ insert into public.door_default_sounds (label, path)
     values ('mine', 'defaults/20260929000000-11111111.mp3') $$,
  '42501',
  null,
  'a member cannot add a default sound'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds', 'defaults/20260929000000-11111111.mp3',
       '82222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'a member cannot upload into defaults/'
);
select throws_ok(
  $$ update public.user_profiles
      set door_sound_path = 'defaults/20260929000000-00000000.mp3',
          door_sound_mode = 'sound_only'
      where id = '82222222-2222-2222-2222-222222222222' $$,
  '23514',
  null,
  'a member cannot point their own greeting at a default file'
);
update public.door_default_sounds set enabled = false;
delete from public.door_default_sounds;
reset role;
select is(
  (select count(*) from public.door_default_sounds where enabled),
  1::bigint,
  'a member''s update and delete touch nothing'
);

-- ── door admin ─────────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.door_default_sounds),
  1::bigint,
  'a door admin sees the default sounds'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds', 'defaults/20260929000000-22222222.mp3',
       '81111111-1111-1111-1111-111111111111') $$,
  'a door admin can upload into defaults/'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('door-sounds', 'defaults/nested/x.mp3',
       '81111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a door admin cannot upload into a subfolder of defaults/'
);
select lives_ok(
  $$ insert into public.door_default_sounds (label, path)
     values ('新的', 'defaults/20260929000000-22222222.mp3') $$,
  'a door admin can add a default sound'
);
select is(
  (select created_by from public.door_default_sounds
    where path = 'defaults/20260929000000-22222222.mp3'),
  '81111111-1111-1111-1111-111111111111'::uuid,
  'created_by defaults to the admin who added it'
);
select throws_ok(
  $$ insert into public.door_default_sounds (label, path)
     values (' padded ', 'defaults/20260929000000-33333333.mp3') $$,
  '23514',
  null,
  'a label with surrounding spaces is rejected'
);
select throws_ok(
  $$ insert into public.door_default_sounds (label, path)
     values ('outside', '81111111-1111-1111-1111-111111111111/x.mp3') $$,
  '23514',
  null,
  'a default sound must live under defaults/'
);
select throws_ok(
  $$ insert into public.door_default_sounds (label, path)
     values ('dup', 'defaults/20260929000000-22222222.mp3') $$,
  '23505',
  null,
  'two default sounds cannot share a file'
);
select lives_ok(
  $$ update public.door_default_sounds
      set label = '改名', enabled = false
      where path = 'defaults/20260929000000-22222222.mp3' $$,
  'a door admin can rename and disable a default sound'
);
select throws_ok(
  $$ update public.door_default_sounds
      set path = 'defaults/20260929000000-44444444.mp3'
      where path = 'defaults/20260929000000-22222222.mp3' $$,
  '42501',
  null,
  'the path is write-once'
);
select lives_ok(
  $$ delete from public.door_default_sounds
      where path = 'defaults/20260929000000-00000000.mp3' $$,
  'a door admin can delete a default sound'
);
reset role;
select results_eq(
  $$ select label, enabled from public.door_default_sounds $$,
  $$ values ('改名'::text, false) $$,
  'only the renamed, disabled sound is left'
);

select * from finish();
rollback;
