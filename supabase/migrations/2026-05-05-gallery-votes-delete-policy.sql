-- allow users to remove only their own votes
drop policy if exists "gallery_image_votes_delete" on public.gallery_image_votes;

create policy "gallery_image_votes_delete"
on public.gallery_image_votes for delete
using (user_id = auth.uid());
