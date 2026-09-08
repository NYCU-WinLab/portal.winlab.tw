-- Ensure gallery_album_photos uses sort_position (not reserved `position`)
-- as the RETURNS TABLE column name. Fresh installs already get this from
-- 20260811010000_gallery-albums.sql; this CREATE OR REPLACE covers envs that
-- failed mid-apply or still need the corrected RPC body.

create or replace function public.gallery_album_photos(p_slug text)
returns table (
  image_id uuid,
  name text,
  image_path text,
  media_type text,
  poster_path text,
  uploader_name text,
  created_by uuid,
  created_at timestamptz,
  sort_position integer,
  added_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gi.id as image_id,
    gi.name,
    gi.image_path,
    gi.media_type,
    gi.poster_path,
    coalesce(up.name, 'Someone') as uploader_name,
    gi.created_by,
    gi.created_at,
    gai.position as sort_position,
    gai.added_at
  from public.gallery_albums ga
  join public.gallery_album_images gai on gai.album_id = ga.id
  join public.gallery_images gi on gi.id = gai.image_id
  left join public.user_profiles up on up.id = gi.created_by
  where ga.slug = lower(trim(p_slug))
  order by gai.position asc, gai.added_at asc, gi.id asc;
$$;

revoke all on function public.gallery_album_photos(text) from public;
grant execute on function public.gallery_album_photos(text)
  to anon, authenticated, service_role;
