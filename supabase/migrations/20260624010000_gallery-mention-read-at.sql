-- In-app read state for gallery @mentions (email still uses notified_at).

alter table public.gallery_comment_mentions
  add column if not exists read_at timestamptz;

create index if not exists gallery_comment_mentions_unread
  on public.gallery_comment_mentions (mentioned_user_id, comment_id)
  where (read_at is null);

create policy "gallery_comment_mentions_update_own_read"
on public.gallery_comment_mentions for update
to authenticated
using (mentioned_user_id = auth.uid())
with check (mentioned_user_id = auth.uid());
