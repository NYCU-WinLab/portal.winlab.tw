-- user_profiles.door_greeting_color regression suite — runs via `supabase test db`.
--
-- 20260923130000 added the column with no new policy or grant, leaning on
-- user_profiles_update_own for "a member edits only their own row". Pin that
-- the lean holds (own row writes, another member's row does not change) and
-- that the check rejects a malformed or too-dark colour as a check violation
-- (23514), never as a cast error.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(20);

insert into auth.users (id) values
  ('61111111-1111-1111-1111-111111111111'),
  ('62222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('61111111-1111-1111-1111-111111111111', 'a@test.local', '詹詠翔', false, '{}'),
  ('62222222-2222-2222-2222-222222222222', 'b@test.local', 'Bob', false, '{}');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- ── own row ────────────────────────────────────────────────────────────────
select lives_ok(
  $$ update public.user_profiles set door_greeting_color = '#ff4040'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'a member can set their own name colour'
);
select is(
  (select door_greeting_color from public.user_profiles
    where id = '61111111-1111-1111-1111-111111111111'),
  '#ff4040',
  'the own-row write is stored'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_color = '#800000'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'red at 128 is bright enough'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_color = '#008000'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'green at 128 is bright enough'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_color = '#000080'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'blue at 128 is bright enough'
);
select lives_ok(
  $$ update public.user_profiles
      set door_greeting_color = '#6699ff', door_greeting_suffix = '好帥'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'colour and suffix save together'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_color = null
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'a member can clear their colour back to the default'
);

-- ── another member's row ──────────────────────────────────────────────────
-- RLS filters the target row out, so the statement succeeds and touches
-- nothing. Assert on the stored value as the superuser, not on an error.
update public.user_profiles set door_greeting_color = '#ff66cc'
  where id = '62222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select door_greeting_color from public.user_profiles
    where id = '62222222-2222-2222-2222-222222222222'),
  null,
  'a member cannot set another member''s colour'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- ── the new column does not widen the privileged-column guard ─────────────
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#ffffff', is_admin = true
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'Direct modification of is_admin is not allowed',
  'a colour write cannot smuggle an is_admin change'
);

-- ── invalid format ────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#FF4040'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'upper-case hex is rejected (the app lower-cases)'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#fff'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'three-digit shorthand is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = 'ff4040'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'a missing # is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#gggggg'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'non-hex digits are a check violation, not a cast error'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#ffffff' || chr(10)
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'a trailing newline is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#ff40400'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'seven hex digits are rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = ''
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'an empty string is rejected (clearing is null)'
);

-- ── too dark ──────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#7f7f7f'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'every channel at 127 is too dark'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_color = '#000000'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'black is too dark'
);
select is(
  (select door_greeting_color from public.user_profiles
    where id = '61111111-1111-1111-1111-111111111111'),
  null,
  'rejected writes leave the stored colour alone'
);

-- anon's column-level SELECT stays (id, name): the colour is not public.
reset role;
select ok(
  not has_column_privilege('anon', 'public.user_profiles', 'door_greeting_color', 'SELECT'),
  'anon cannot read door_greeting_color'
);

select * from finish();
rollback;
