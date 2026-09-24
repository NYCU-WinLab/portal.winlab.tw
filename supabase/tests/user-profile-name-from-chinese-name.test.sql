-- user_profiles.name from Keycloak's chinese_name (#415), via `supabase test db`.
--
-- 20260924014503 makes custom_claims.chinese_name the source of a member's
-- name, with #1218's Han reorder of the OIDC name as the fallback, and teaches
-- the auth.users UPDATE trigger to carry name and email as well as username.
-- handle-new-user-name-order.test.sql still pins the fallback cases; this file
-- pins the claim, the update path and the helper's ACL.
--
-- As in that file: the signup trigger lives on auth.users, which the
-- migrations do not manage, so attach one for this transaction if it is
-- missing. The UPDATE trigger is created by the migrations and is used as is.
--
-- "No write" is checked through the row's ctid: every UPDATE, HOT or not,
-- leaves a new tuple version at a new ctid, while xmin cannot tell inside a
-- single test transaction.

begin;
create extension if not exists pgtap with schema public;

select plan(16);

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'auth.users'::regclass
       and tgfoid = 'public.handle_new_user'::regproc
  ) then
    create trigger pgtap_handle_new_user
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('b2b2b2b2-0000-0000-0000-000000000001', 'claim@test.local',
   '{"name": "承運 何", "custom_claims": {"chinese_name": "何承運", "preferred_username": "claim.user"}}'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'no-claims@test.local',
   '{"name": "詠翔 詹"}'),
  ('b2b2b2b2-0000-0000-0000-000000000003', 'empty-claim@test.local',
   '{"name": "詠翔 詹", "custom_claims": {"chinese_name": "  ", "preferred_username": "empty.claim"}}'),
  ('b2b2b2b2-0000-0000-0000-000000000004', 'latin@test.local',
   '{"name": "Simon Chu"}'),
  ('b2b2b2b2-0000-0000-0000-000000000005', 'no-name@test.local',
   '{}');

-- ── signup ────────────────────────────────────────────────────────────────
select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  '何承運',
  'signup takes the name from custom_claims.chinese_name'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000002'),
  '詹詠翔',
  'signup without custom_claims falls back to the Han reorder'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000003'),
  '詹詠翔',
  'signup with an empty chinese_name falls back to the Han reorder'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000004'),
  'Simon Chu',
  'a non-Han name with no claim is stored as sent'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000005'),
  'no-name@test.local',
  'no name at all falls back to the email'
);

-- ── later sign-ins ────────────────────────────────────────────────────────
update auth.users
   set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{custom_claims,chinese_name}', '"何承云"')
 where id = 'b2b2b2b2-0000-0000-0000-000000000001';

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  '何承云',
  'a changed chinese_name reaches user_profiles.name'
);

create temp table ctid_before as
  select ctid::text as before_ctid from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001';

-- A sign-in that rewrites the metadata with the same values.
update auth.users
   set raw_user_meta_data = raw_user_meta_data
 where id = 'b2b2b2b2-0000-0000-0000-000000000001';

select is(
  (select ctid::text from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  (select before_ctid from ctid_before),
  'an unchanged chinese_name does not write the profile row'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  '何承云',
  'an unchanged chinese_name leaves the name as it was'
);

update auth.users
   set email = 'claim-new@test.local'
 where id = 'b2b2b2b2-0000-0000-0000-000000000001';

select is(
  (select email from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  'claim-new@test.local',
  'an email change reaches user_profiles.email'
);

update auth.users
   set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{custom_claims,preferred_username}', '"claim.renamed"')
 where id = 'b2b2b2b2-0000-0000-0000-000000000001';

select is(
  (select username from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  'claim.renamed',
  'the username sync still works'
);

-- A member who had no claim at signup gets one on a later sign-in.
update auth.users
   set raw_user_meta_data = '{"name": "詠翔 詹", "custom_claims": {"chinese_name": "詹詠翔", "preferred_username": "late.claim"}}'
 where id = 'b2b2b2b2-0000-0000-0000-000000000002';

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000002'),
  '詹詠翔',
  'a claim that appears later is picked up'
);

-- ── the helper itself ─────────────────────────────────────────────────────
select is(
  public.member_display_name('{"name": " Simon Chu ", "custom_claims": {"chinese_name": ""}}', 'x@test.local'),
  'Simon Chu',
  'member_display_name trims the fallback name'
);

select is(
  public.member_display_name('{"name": "   "}', 'x@test.local'),
  'x@test.local',
  'member_display_name treats a blank name as missing'
);

select is(
  (select provolatile::text from pg_proc where oid = 'public.member_display_name(jsonb, text)'::regprocedure),
  'i',
  'member_display_name is immutable'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
     from aclexplode((select proacl from pg_proc
                      where oid = 'public.member_display_name(jsonb, text)'::regprocedure)) a),
  array['postgres', 'service_role'],
  'member_display_name is executable only by the owner and service_role'
);

select ok(
  (select pg_get_triggerdef(oid) like '%UPDATE OF raw_user_meta_data, email ON auth.users%'
     from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_username_sync'),
  'the sync trigger fires on email changes too'
);

select * from finish();
rollback;
