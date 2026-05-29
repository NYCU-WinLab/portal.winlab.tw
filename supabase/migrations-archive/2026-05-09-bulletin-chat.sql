-- supabase/migrations/2026-05-09-bulletin-chat.sql
-- Realtime chat layered on top of the bulletin board.
-- Three message kinds:
--   1. plain message — anyone can post, no email
--   2. broadcast (is_broadcast = true) — admin-only, email everyone
--   3. @mention — anyone can post, email mentioned users
-- Broadcast / mention emails are delivered by Google Apps Script polling the
-- Next.js API; the *_notified_at columns are the gate.

-- =============================================================================
-- bulletin_messages
-- =============================================================================

create table public.bulletin_messages (
  id                       uuid        primary key default gen_random_uuid(),
  content                  text        not null check (length(content) > 0),
  author_id                uuid        not null references public.user_profiles(id) on delete cascade,
  is_broadcast             boolean     not null default false,
  broadcast_notified_at    timestamptz,
  created_at               timestamptz not null default now()
);

create index bulletin_messages_created_at on public.bulletin_messages (created_at desc);
create index bulletin_messages_broadcast_pending
  on public.bulletin_messages (created_at)
  where is_broadcast = true and broadcast_notified_at is null;

-- =============================================================================
-- bulletin_message_mentions (composite PK; one row per mentioned user)
-- =============================================================================

create table public.bulletin_message_mentions (
  message_id          uuid        not null references public.bulletin_messages(id) on delete cascade,
  mentioned_user_id   uuid        not null references public.user_profiles(id) on delete cascade,
  notified_at         timestamptz,
  primary key (message_id, mentioned_user_id)
);

create index bulletin_message_mentions_pending
  on public.bulletin_message_mentions (message_id)
  where notified_at is null;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.bulletin_messages         enable row level security;
alter table public.bulletin_message_mentions enable row level security;

-- All authenticated users can read every message
create policy "authenticated users can read messages"
  on public.bulletin_messages for select
  to authenticated
  using (true);

-- Anyone authenticated can post a message as themselves;
-- only portal admins can set is_broadcast = true.
create policy "authenticated users can post messages"
  on public.bulletin_messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (is_broadcast = false or public.is_portal_admin())
  );

-- Authors can delete their own messages; admins can delete any
create policy "authors and admins can delete messages"
  on public.bulletin_messages for delete
  to authenticated
  using (author_id = auth.uid() or public.is_portal_admin());

-- Mentions are readable by everyone authenticated
create policy "authenticated users can read mentions"
  on public.bulletin_message_mentions for select
  to authenticated
  using (true);

-- Mentions are inserted via the API (using service role); no direct
-- client write path — leave write policies off.

-- =============================================================================
-- Realtime publication
-- =============================================================================

alter publication supabase_realtime add table public.bulletin_messages;
alter publication supabase_realtime add table public.bulletin_message_mentions;
