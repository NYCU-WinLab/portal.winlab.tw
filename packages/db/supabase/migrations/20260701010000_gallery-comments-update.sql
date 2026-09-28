-- Allow comment authors to edit their own comments.

alter table public.gallery_comments
  add column if not exists updated_at timestamptz;

create policy "gallery_comments_update"
on public.gallery_comments for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
