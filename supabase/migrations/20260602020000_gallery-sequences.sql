-- Group burst uploads into a single expandable gallery card.
alter table public.gallery_images
  add column if not exists sequence_id uuid,
  add column if not exists sequence_index integer;

create index if not exists gallery_images_sequence_idx
  on public.gallery_images (sequence_id, sequence_index, created_at desc);
