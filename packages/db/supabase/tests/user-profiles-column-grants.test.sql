-- user_profiles column grants from 20261012145616_user_profiles_column_grants
-- — runs via `supabase test db`.
--
-- Pins:
--   * authenticated reads only the columns the apps use; the bot / chat-id
--     columns are gone, service_role keeps them;
--   * authenticated writes only its own door_* columns — name, email,
--     username, roles, is_admin are not member-writable, and INSERT / DELETE
--     are not granted at all;
--   * the RLS policies on other tables that subquery is_admin / roles as the
--     caller still evaluate.

begin;
create extension if not exists pgtap with schema public;

select plan(19);

insert into auth.users (id) values
  ('61111111-1111-1111-1111-111111111111'),
  ('62222222-2222-2222-2222-222222222222');
insert into public.user_profiles (id, email, name, username, is_admin, roles) values
  ('61111111-1111-1111-1111-111111111111', 'a@test.local', '甲', 'member-a', false, '{}'),
  ('62222222-2222-2222-2222-222222222222', 'b@test.local', '乙', 'member-b', false, '{}');

-- ── 1-7. dropped columns ───────────────────────────────────────────────────
select ok(
  not has_column_privilege('authenticated', 'public.user_profiles', c, 'SELECT'),
  'authenticated cannot read ' || c
)
from unnest(array[
  'line_user_id', 'telegram_user_id', 'discord_user_id', 'claude_session_id',
  'active_workflow', 'last_active_platform', 'created_at'
]) c;

-- ── 8-10. what stays, and nothing table-wide ──────────────────────────────
select ok(
  bool_and(has_column_privilege('authenticated', 'public.user_profiles', c, 'SELECT')),
  'authenticated still reads the columns the apps use'
)
from unnest(array[
  'id', 'name', 'email', 'username', 'lab_status', 'lab_status_synced_at',
  'is_admin', 'roles', 'door_greeting_suffix', 'door_greeting_color',
  'door_sound_path', 'door_sound_mode'
]) c;

select ok(
  not (has_table_privilege('authenticated', 'public.user_profiles', 'SELECT')
    or has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE')
    or has_table_privilege('authenticated', 'public.user_profiles', 'INSERT')
    or has_table_privilege('authenticated', 'public.user_profiles', 'DELETE')),
  'authenticated holds no table-wide privilege on user_profiles'
);

select ok(
  not bool_or(has_column_privilege('authenticated', 'public.user_profiles', c, 'UPDATE')),
  'authenticated cannot update name, email, username, roles, is_admin or lab_status'
)
from unnest(array['name', 'email', 'username', 'roles', 'is_admin', 'lab_status']) c;

-- ── 11-16. as a signed-in member ──────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.user_profiles
    where id in ('61111111-1111-1111-1111-111111111111',
                 '62222222-2222-2222-2222-222222222222')
      and name is not null and email is not null),
  2,
  'a member still reads other members'' names and emails'
);

select throws_ok(
  $$ select line_user_id from public.user_profiles $$,
  '42501', null,
  'a member cannot read anyone''s LINE id'
);

select throws_ok(
  $$ update public.user_profiles set name = '假名'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'a member cannot rename themselves'
);

select throws_ok(
  $$ update public.user_profiles set username = 'member-b'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'a member cannot take another username'
);

select lives_ok(
  $$ update public.user_profiles set door_greeting_suffix = '早安'
      where id = '61111111-1111-1111-1111-111111111111' $$,
  'a member can still set their own door greeting'
);

select throws_ok(
  $$ insert into public.user_profiles (id, name)
     values ('63333333-3333-3333-3333-333333333333', 'x') $$,
  '42501', null,
  'a member cannot insert a profile'
);

-- ── 17-18. policies elsewhere that read is_admin / roles as the caller ─────
select lives_ok(
  $$ select count(*) from public.bento_menus $$,
  'bento_menus policies still evaluate for a member'
);
select lives_ok(
  $$ select count(*) from public.gallery_albums $$,
  'gallery_albums policies still evaluate for a member'
);

reset role;

-- ── 19. the trusted backend is untouched ──────────────────────────────────
select ok(
  has_column_privilege('service_role', 'public.user_profiles', 'line_user_id', 'SELECT'),
  'service_role still reads the bot columns'
);

select * from finish();
rollback;
