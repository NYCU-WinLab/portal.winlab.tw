-- Add gallery cheers reaction (🍻).

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
      'point',
      'cheers'
    )
  );
