-- Multi-reaction votes: like, love, point (👉👈). One reaction per user per image.

alter table public.gallery_image_votes
  add column if not exists reaction text not null default 'like';

alter table public.gallery_image_votes
  drop constraint if exists gallery_image_votes_reaction_check;

alter table public.gallery_image_votes
  add constraint gallery_image_votes_reaction_check
  check (
    reaction in (
      'like',
      'love',
      'haha',
      'wow',
      'sad',
      'angry',
      'point'
    )
  );

-- Users may switch reaction type without delete+insert.
drop policy if exists "gallery_image_votes_update" on public.gallery_image_votes;

create policy "gallery_image_votes_update"
on public.gallery_image_votes for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
