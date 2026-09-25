-- user_profiles.name from Keycloak's chinese_name (#415), via `supabase test db`.
--
-- 20260925051225 makes custom_claims.chinese_name the source of a member's
-- name, with #1218's Han reorder of the OIDC name as the fallback, and teaches
-- the auth.users UPDATE trigger to carry name and email as well as username.
-- handle-new-user-name-order.test.sql still pins the fallback cases; this file
-- pins the claim, the update path, the helper's ACL, handle_new_user's pinned
-- search_path and the migration's one-off backfill.
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

select plan(27);

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
   '{}'),
  ('b2b2b2b2-0000-0000-0000-000000000010', 'korean@test.local',
   '{"name": "민수 김"}');

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

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000010'),
  '민수 김',
  'a Hangul "given family" name with no claim is stored as sent, not reordered'
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

-- ── the Han ranges ────────────────────────────────────────────────────────
-- The migration writes its ranges as \u escapes, because a literal U+F900
-- is NFC-normalised to U+8C48 on the way to prod, which stretches the range
-- over Hangul (U+AC00-D7A3) and the private-use area. Compatibility
-- ideographs are built with chr() so this file holds none of them literally.
select ok(
  chr(63744) ~ '^[\uF900-\uFAFF]$' and chr(44032) !~ '^[\uF900-\uFAFF]$',
  'a standard-conforming literal reads \uXXXX as an ARE escape'
);

select is(
  public.member_display_name('{"name": "민수 김"}', 'x@test.local'),
  '민수 김',
  'member_display_name does not reorder a Hangul name'
);

select is(
  public.member_display_name(
    jsonb_build_object('name', chr(57344) || ' ' || chr(57345)), 'x@test.local'),
  chr(57344) || ' ' || chr(57345),
  'member_display_name does not reorder private-use characters'
);

select is(
  public.member_display_name(
    jsonb_build_object('name', chr(63744) || chr(63745) || ' ' || chr(26446)),
    'x@test.local'),
  chr(26446) || chr(63744) || chr(63745),
  'member_display_name still reorders a name using U+F900-FAFF compatibility ideographs'
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

-- ── handle_new_user's search_path ─────────────────────────────────────────
select ok(
  (select proconfig from pg_proc
    where oid = 'public.handle_new_user()'::regprocedure)
    @> array['search_path=""'],
  'handle_new_user runs with an empty search_path'
);

-- Sign up with the caller's search_path emptied too: the trigger must not
-- lean on it for anything.
set local search_path = '';
insert into auth.users (id, email, raw_user_meta_data) values
  ('b2b2b2b2-0000-0000-0000-000000000006', 'pinned@test.local',
   '{"custom_claims": {"chinese_name": "林小明", "preferred_username": "pinned.user"}}');
reset search_path;

select is(
  (select name || '/' || username from public.user_profiles
    where id = 'b2b2b2b2-0000-0000-0000-000000000006'),
  '林小明/pinned.user',
  'signup still creates the profile under the pinned search_path'
);

-- ── the backfill ──────────────────────────────────────────────────────────
-- Profiles in the state prod was in before this migration: names and emails
-- written once at signup and drifted since. Set directly, since the sync
-- trigger would otherwise fix them on the auth.users side.
insert into auth.users (id, email, raw_user_meta_data) values
  ('b2b2b2b2-0000-0000-0000-000000000007', 'bf-claim@test.local',
   '{"name": "承運 何", "custom_claims": {"chinese_name": "何承運"}}'),
  ('b2b2b2b2-0000-0000-0000-000000000008', 'bf-none@test.local',
   '{"name": "詠翔 詹"}'),
  ('b2b2b2b2-0000-0000-0000-000000000009', 'bf-empty@test.local',
   '{"name": "詠翔 詹", "custom_claims": {"chinese_name": ""}}');

update public.user_profiles
   set name = 'Old Name', email = 'stale@test.local'
 where id in ('b2b2b2b2-0000-0000-0000-000000000007',
              'b2b2b2b2-0000-0000-0000-000000000008',
              'b2b2b2b2-0000-0000-0000-000000000009');

-- Verbatim from 20260925051225 section 4.
update public.user_profiles p
set name  = case
              when nullif(trim(u.raw_user_meta_data->'custom_claims'->>'chinese_name'), '') is not null
              then public.member_display_name(u.raw_user_meta_data, u.email)
              else p.name
            end,
    email = u.email
from auth.users u
where u.id = p.id
  and (
    (nullif(trim(u.raw_user_meta_data->'custom_claims'->>'chinese_name'), '') is not null
     and p.name is distinct from public.member_display_name(u.raw_user_meta_data, u.email))
    or p.email is distinct from u.email
  );

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000007'),
  '何承運',
  'the backfill renames a member whose metadata carries a chinese_name'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000008'),
  'Old Name',
  'the backfill leaves the name alone when there is no claim'
);

select is(
  (select name from public.user_profiles where id = 'b2b2b2b2-0000-0000-0000-000000000009'),
  'Old Name',
  'the backfill leaves the name alone when the claim is empty'
);

select is(
  (select array_agg(email order by email) from public.user_profiles
    where id in ('b2b2b2b2-0000-0000-0000-000000000007',
                 'b2b2b2b2-0000-0000-0000-000000000008',
                 'b2b2b2b2-0000-0000-0000-000000000009')),
  array['bf-claim@test.local', 'bf-empty@test.local', 'bf-none@test.local'],
  'the backfill repairs every drifted email'
);

select * from finish();
rollback;
