-- In-app notifications for comment replies and photo reactions.

create table if not exists public.gallery_activity_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null check (kind in ('reply', 'reaction')),
  image_id uuid not null references public.gallery_images(id) on delete cascade,
  comment_id uuid references public.gallery_comments(id) on delete cascade,
  actor_user_id uuid not null references public.user_profiles(id) on delete cascade,
  reaction text,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint gallery_activity_reply_needs_comment check (
    kind <> 'reply' or comment_id is not null
  ),
  constraint gallery_activity_reaction_check check (
    kind <> 'reaction'
    or reaction = any (
      array['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'sad'::text, 'angry'::text, 'point'::text, 'cheers'::text]
    )
  )
);

create unique index if not exists gallery_activity_reply_unique
  on public.gallery_activity_notifications (comment_id, recipient_user_id)
  where (kind = 'reply');

create unique index if not exists gallery_activity_reaction_unique
  on public.gallery_activity_notifications (image_id, actor_user_id, recipient_user_id)
  where (kind = 'reaction');

create index if not exists gallery_activity_notifications_unread
  on public.gallery_activity_notifications (recipient_user_id, created_at desc)
  where (read_at is null);

alter table public.gallery_activity_notifications enable row level security;

create policy "gallery_activity_notifications_select"
on public.gallery_activity_notifications for select
to authenticated
using (true);

create policy "gallery_activity_notifications_update_own_read"
on public.gallery_activity_notifications for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

alter publication supabase_realtime add table public.gallery_activity_notifications;
