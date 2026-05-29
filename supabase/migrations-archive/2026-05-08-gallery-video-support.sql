-- gallery.winlab.tw — let videos onto the wall.
-- Existing rows stay images by default. Videos carry a poster image plus
-- duration metadata so the grid can render a thumbnail without round-tripping
-- the whole file just to grab the first frame.

alter table public.gallery_images
  add column media_type text not null default 'image',
  add column poster_path text,
  add column duration_seconds integer;

alter table public.gallery_images
  add constraint gallery_images_media_type_check
  check (media_type in ('image', 'video'));

-- Videos must have a poster (we generate it client-side from the first frame).
-- Images must not — keeps the data model honest, no orphan poster paths.
alter table public.gallery_images
  add constraint gallery_images_poster_only_for_video
  check (
    (media_type = 'image' and poster_path is null)
    or (media_type = 'video' and poster_path is not null)
  );

-- Cap object size at 30 MB. Compressed 720p/60s ~ 7-10 MB, so this leaves
-- headroom without letting someone shovel a raw 4K clip into the bucket.
update storage.buckets
  set file_size_limit = 31457280,
      allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
        'image/heic',
        'image/heif',
        'video/webm',
        'video/mp4',
        'video/quicktime'
      ]
  where id = 'gallery';
