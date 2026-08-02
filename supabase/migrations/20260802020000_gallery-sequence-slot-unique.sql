-- Prevent duplicate sequence slots when a false-failure retry re-inserts
-- the same (sequence_id, sequence_index) after the first insert already
-- committed. Partial sequences (holes) remain allowed; only collisions
-- are blocked.

-- Keep the oldest row per slot if duplicates already exist.
with ranked as (
  select
    id,
    row_number() over (
      partition by sequence_id, sequence_index
      order by created_at asc, id asc
    ) as rn
  from public.gallery_images
  where sequence_id is not null
    and sequence_index is not null
)
delete from public.gallery_images
where id in (select id from ranked where rn > 1);

create unique index if not exists gallery_images_sequence_slot_unique
  on public.gallery_images (sequence_id, sequence_index)
  where sequence_id is not null and sequence_index is not null;
