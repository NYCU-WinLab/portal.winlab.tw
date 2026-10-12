-- 20261012163913_admin_checks_via_definer_helpers — runs via `supabase test db`.
--
-- Pins:
--   * no RLS policy outside user_profiles, and no SECURITY INVOKER function,
--     reads user_profiles.is_admin / roles as the caller any more;
--   * members: an ordinary member can no longer write the directory, while a
--     super admin and a directory admin can;
--   * bento: an ordinary member cannot add a menu, a bento admin can;
--   * get_my_access() returns the caller's own is_admin / roles and is not
--     anon-callable.

begin;
create extension if not exists pgtap with schema public;

select plan(12);

-- ── 1-3. ACL, before the blanket grant below so the migration's own grants
-- are what's checked ─────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.get_my_access()', 'EXECUTE'),
  'anon cannot call get_my_access'
);
select ok(
  not has_function_privilege('anon', 'public.is_bento_admin()', 'EXECUTE'),
  'anon cannot call is_bento_admin'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_access()', 'EXECUTE'),
  'authenticated can call get_my_access'
);

grant execute on all functions in schema public to authenticated;

insert into auth.users (id) values
  ('71111111-1111-1111-1111-111111111111'),
  ('72222222-2222-2222-2222-222222222222'),
  ('73333333-3333-3333-3333-333333333333'),
  ('74444444-4444-4444-4444-444444444444');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('71111111-1111-1111-1111-111111111111', 'member@test.local', '成員', false, '{}'),
  ('72222222-2222-2222-2222-222222222222', 'super@test.local', '超管', true, '{}'),
  ('73333333-3333-3333-3333-333333333333', 'dir@test.local', '名錄', false, '{"directory":["admin"]}'),
  ('74444444-4444-4444-4444-444444444444', 'bento@test.local', '便當', false, '{"bento":["admin"]}');

-- ── 4-5. catalog: nothing reads is_admin / roles as the caller ─────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename <> 'user_profiles'
      and coalesce(qual, '') || coalesce(with_check, '') ~ 'user_profiles'),
  0,
  'no policy on another table subqueries user_profiles'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not p.prosecdef
      and p.prosrc ~ 'user_profiles'
      and p.prosrc ~ '\m(is_admin|roles)\M'),
  0,
  'no SECURITY INVOKER function reads is_admin / roles from user_profiles'
);

-- ── 6-7. ordinary member ───────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.members (name, email, role) values ('假人', 'x@test.local', 'pending') $$,
  '42501', null,
  'an ordinary member cannot add a directory row (super admins existing no longer counts)'
);
select throws_ok(
  $$ insert into public.bento_menus (name, phone) values ('假店', '000') $$,
  '42501', null,
  'an ordinary member cannot add a bento menu'
);

-- ── 8-9. get_my_access ─────────────────────────────────────────────────────
select is(
  (select row(is_admin, roles)::text from public.get_my_access()),
  row(false, '{}'::jsonb)::text,
  'get_my_access returns the caller''s own access'
);

select set_config('request.jwt.claims',
  '{"sub":"73333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is(
  (select roles from public.get_my_access()),
  '{"directory":["admin"]}'::jsonb,
  'get_my_access returns roles for another caller too'
);

-- ── 10. directory admin ─────────────────────────────────────────────────────
select lives_ok(
  $$ insert into public.members (name, email, role) values ('名錄新增', 'd@test.local', 'pending') $$,
  'a directory admin can add a directory row'
);

-- ── 11. super admin ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"72222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.members (name, email, role) values ('超管新增', 's@test.local', 'pending') $$,
  'a super admin can add a directory row'
);

-- ── 12. bento admin ────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"74444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.bento_menus (name, phone) values ('真店', '000') $$,
  'a bento admin can add a bento menu'
);

reset role;

select * from finish();
rollback;
