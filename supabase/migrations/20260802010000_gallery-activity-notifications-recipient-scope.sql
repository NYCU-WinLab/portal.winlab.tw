-- Recipients should only read their own activity notifications.
-- The previous SELECT policy used `using (true)`, which leaked every
-- authenticated user's inbox rows to any signed-in caller.

drop policy if exists "gallery_activity_notifications_select"
  on public.gallery_activity_notifications;

create policy "gallery_activity_notifications_select"
on public.gallery_activity_notifications for select
to authenticated
using (recipient_user_id = auth.uid());
