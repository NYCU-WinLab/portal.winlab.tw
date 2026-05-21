-- Expand reactions to Facebook-style set + lab point (👉👈).

alter table public.gallery_image_votes
  drop constraint if exists gallery_image_votes_reaction_check;

alter table public.gallery_image_votes
  add constraint gallery_image_votes_reaction_check
  check (
    reaction in (
      'like',
      'love',
      'care',
      'haha',
      'wow',
      'sad',
      'angry',
      'point'
    )
  );
