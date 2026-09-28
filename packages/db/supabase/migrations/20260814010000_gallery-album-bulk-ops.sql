-- Album bulk remove + harden gallery_album_photos RETURNS TABLE.
-- Unquoted `position` is reserved in RETURNS TABLE; broken mid-apply envs
-- still need a DROP + recreate with sort_position (see issue #441).

drop function if exists public.gallery_album_photos(text);

create function public.gallery_album_photos(p_slug text)
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

-- Owner/admin bulk remove; RLS still gates the DELETE/UPDATE.
-- Returns how many membership rows were deleted. Cap matches album photo max.
create or replace function public.gallery_album_remove_images(
  p_album_id uuid,
  p_image_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
  v_removed integer := 0;
  v_cover uuid;
  v_next uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_album_id is null then
    return 0;
  end if;

  select array_agg(x)
  into v_ids
  from (
    select distinct u as x
    from unnest(coalesce(p_image_ids, '{}'::uuid[])) as u
    where u is not null
    limit 200
  ) capped;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.gallery_albums ga where ga.id = p_album_id
  ) then
    raise exception 'Album not found';
  end if;

  delete from public.gallery_album_images gai
  where gai.album_id = p_album_id
    and gai.image_id = any(v_ids);

  get diagnostics v_removed = row_count;

  select ga.cover_image_id
  into v_cover
  from public.gallery_albums ga
  where ga.id = p_album_id;

  if v_cover is not null
     and not exists (
       select 1
       from public.gallery_album_images gai
       where gai.album_id = p_album_id
         and gai.image_id = v_cover
     )
  then
    select gai.image_id
    into v_next
    from public.gallery_album_images gai
    where gai.album_id = p_album_id
    order by gai.position asc, gai.added_at asc, gai.image_id asc
    limit 1;

    update public.gallery_albums
    set
      cover_image_id = v_next,
      updated_at = now()
    where id = p_album_id;
  elsif v_removed > 0 then
    update public.gallery_albums
    set updated_at = now()
    where id = p_album_id;
  end if;

  return v_removed;
end;
$$;

revoke all on function public.gallery_album_remove_images(uuid, uuid[]) from public;
grant execute on function public.gallery_album_remove_images(uuid, uuid[])
  to authenticated;
