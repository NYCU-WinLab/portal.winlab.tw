-- @mentions on gallery comments; email delivery polls notified_at via API.

create table if not exists public.gallery_comment_mentions (
  comment_id uuid not null references public.gallery_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.user_profiles(id) on delete cascade,
  notified_at timestamptz,
  primary key (comment_id, mentioned_user_id)
);

create index if not exists gallery_comment_mentions_pending
  on public.gallery_comment_mentions (comment_id)
  where (notified_at is null);

alter table public.gallery_comment_mentions enable row level security;

create policy "gallery_comment_mentions_select"
on public.gallery_comment_mentions for select
to authenticated
using (true);
