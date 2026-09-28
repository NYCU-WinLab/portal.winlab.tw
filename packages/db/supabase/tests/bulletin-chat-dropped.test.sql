-- Bulletin chat removal (20260925120000), runs via `supabase test db`.
--
-- Pins: both chat tables are gone and out of the realtime publication, while
-- the things the chat sat next to survive: the announcements board and the
-- member directory. A member row still exists after the drop, so the chat's
-- user_profiles foreign keys took nothing with them.

begin;
create extension if not exists pgtap with schema public;

select plan(6);

insert into auth.users (id) values ('81111111-1111-1111-1111-111111111111');
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('81111111-1111-1111-1111-111111111111', 'a@test.local', '詹詠翔', false, '{}')
on conflict (id) do nothing;

select hasnt_table('public', 'bulletin_messages', 'chat messages table is gone');
select hasnt_table(
  'public', 'bulletin_message_mentions', 'chat mentions table is gone'
);
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('bulletin_messages', 'bulletin_message_mentions')),
  0,
  'chat tables are out of the realtime publication'
);
select has_table('public', 'announcements', 'announcements board survives');
select has_table('public', 'user_profiles', 'member directory survives');
select is(
  (select count(*)::int from public.user_profiles
    where id = '81111111-1111-1111-1111-111111111111'),
  1,
  'a member row survives the chat drop'
);

select * from finish();
rollback;
