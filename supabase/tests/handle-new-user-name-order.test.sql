-- handle_new_user name order, run via `supabase test db`.
--
-- 20260923050000 makes the signup trigger store a Han "given family" name as
-- "familygiven". Pin the swap, and pin that nothing else about the row
-- changed: Latin names, already-ordered names, the email fallback and the
-- username copy all have to come through exactly as before.
--
-- The trigger that calls handle_new_user() sits on auth.users, which the
-- migrations do not manage (see the baseline header), so the local database
-- has none. Attach one for this transaction if it is missing; the rollback
-- takes it away again.

begin;
create extension if not exists pgtap with schema public;

select plan(9);

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
  ('a1a1a1a1-0000-0000-0000-000000000001', 'given-family@test.local',
   '{"name": "詠翔 詹", "custom_claims": {"preferred_username": "given.family"}}'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'two-char-family@test.local',
   '{"name": "娜娜 歐陽"}'),
  ('a1a1a1a1-0000-0000-0000-000000000003', 'ordered@test.local',
   '{"name": "詹詠翔"}'),
  ('a1a1a1a1-0000-0000-0000-000000000004', 'latin@test.local',
   '{"name": "Simon Chu"}'),
  ('a1a1a1a1-0000-0000-0000-000000000005', 'mixed@test.local',
   '{"name": "詠翔 詹 Loki"}'),
  ('a1a1a1a1-0000-0000-0000-000000000006', 'no-name@test.local',
   '{}');

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  '詹詠翔',
  'a Han "given family" name is stored family first'
);

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000002'),
  '歐陽娜娜',
  'a two-character family name moves as a whole'
);

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000003'),
  '詹詠翔',
  'an already ordered Han name is left alone'
);

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000004'),
  'Simon Chu',
  'a Latin name is stored as sent'
);

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000005'),
  '詠翔 詹 Loki',
  'a name that is not exactly two Han runs is stored as sent'
);

select is(
  (select name from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000006'),
  'no-name@test.local',
  'a missing name still falls back to the email'
);

select is(
  (select email from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  'given-family@test.local',
  'the email is copied'
);

select is(
  (select username from public.user_profiles where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  'given.family',
  'the Keycloak username is still copied'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.handle_new_user'::regproc),
  'handle_new_user is still SECURITY DEFINER'
);

select * from finish();
rollback;
