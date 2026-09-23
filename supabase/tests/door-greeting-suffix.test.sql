-- user_profiles.door_greeting_suffix regression suite — runs via `supabase test db`.
--
-- 20260923120000 added the column with no new policy or grant, leaning on
-- user_profiles_update_own for "a member edits only their own row". Pin that
-- the lean holds (own row writes, another member's row does not change) and
-- that the width check rejects what the panel cannot draw.

begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(17);

insert into auth.users (id) values
  ('51111111-1111-1111-1111-111111111111'),
  ('52222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('51111111-1111-1111-1111-111111111111', 'a@test.local', '詹詠翔', false, '{}'),
  ('52222222-2222-2222-2222-222222222222', 'b@test.local', 'Bob', false, '{}');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- ── own row ────────────────────────────────────────────────────────────────
select lives_ok(
  $$ update public.user_profiles set door_greeting_suffix = '好帥！'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  'a member can set their own suffix'
);
select is(
  (select door_greeting_suffix from public.user_profiles
    where id = '51111111-1111-1111-1111-111111111111'),
  '好帥！',
  'the own-row write is stored'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_suffix = 'hello!'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '6 ASCII characters (30 px) fit'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_suffix = '讚ab c'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  'mixed Han and ASCII within 32 px fits'
);
select lives_ok(
  $$ update public.user_profiles set door_greeting_suffix = null
      where id = '51111111-1111-1111-1111-111111111111' $$,
  'a member can clear their suffix back to the default'
);

-- ── another member's row ──────────────────────────────────────────────────
-- RLS filters the target row out, so the statement succeeds and touches
-- nothing. Assert on the stored value as the superuser, not on an error.
update public.user_profiles set door_greeting_suffix = '哈'
  where id = '52222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select door_greeting_suffix from public.user_profiles
    where id = '52222222-2222-2222-2222-222222222222'),
  null,
  'a member cannot set another member''s suffix'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

-- ── the new column does not widen the privileged-column guard ─────────────
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = '！', is_admin = true
      where id = '51111111-1111-1111-1111-111111111111' $$,
  'Direct modification of is_admin is not allowed',
  'a suffix write cannot smuggle an is_admin change'
);

-- ── invalid values ────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = '一二三四'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  '4 Han characters (40 px) are rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = 'abcdefg'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  '7 ASCII characters (35 px) are rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = '一二三a'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  '3 Han plus 1 ASCII (35 px) is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = '！！！！'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'full-width punctuation counts 10 px each'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = ''
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'an empty string is rejected (clearing is null)'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = ' 讚'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'leading whitespace is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = '讚' || chr(12288)
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'trailing ideographic space is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = 'a' || chr(10) || 'b'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'a control character is rejected'
);
select throws_ok(
  $$ update public.user_profiles set door_greeting_suffix = 'a' || chr(8203) || 'b'
      where id = '51111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'a zero-width space is rejected'
);

-- anon's column-level SELECT stays (id, name): the suffix is not public.
reset role;
select ok(
  not has_column_privilege('anon', 'public.user_profiles', 'door_greeting_suffix', 'SELECT'),
  'anon cannot read door_greeting_suffix'
);

select * from finish();
rollback;
