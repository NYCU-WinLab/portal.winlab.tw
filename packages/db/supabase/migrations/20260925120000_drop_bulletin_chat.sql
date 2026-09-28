-- The bulletin chat room saw too little use to keep, so it goes: the floating
-- chat on the portal home page, its API routes and MCP tools were removed in
-- the same change. Announcements stay; they live in public.announcements and
-- are untouched here.
--
-- No CASCADE on purpose. Both tables only point outwards (author and mention
-- rows reference user_profiles, mentions reference messages), nothing points
-- in, so a plain drop is enough. If something ever came to depend on them,
-- the drop should fail loudly rather than take that object down with it.
-- Dropping a table also removes it from the supabase_realtime publication.

drop table if exists public.bulletin_message_mentions;
drop table if exists public.bulletin_messages;
