-- Notify comment authors when someone likes their comment.

alter table public.gallery_activity_notifications
  drop constraint if exists gallery_activity_notifications_kind_check;

alter table public.gallery_activity_notifications
  add constraint gallery_activity_notifications_kind_check
  check (kind in ('reply', 'reaction', 'comment_like'));

alter table public.gallery_activity_notifications
  drop constraint if exists gallery_activity_comment_like_needs_comment;

alter table public.gallery_activity_notifications
  add constraint gallery_activity_comment_like_needs_comment check (
    kind <> 'comment_like' or comment_id is not null
  );

create unique index if not exists gallery_activity_comment_like_unique
  on public.gallery_activity_notifications (comment_id, actor_user_id, recipient_user_id)
  where (kind = 'comment_like');
