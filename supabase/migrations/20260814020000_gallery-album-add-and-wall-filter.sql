-- Bulk add to albums + wall filter by album slug (sequence-aware covers).

-- Owner/admin bulk add; RLS still gates the INSERT. Cap matches album photo max.
-- Returns how many membership rows were inserted (duplicates skipped).
create or replace function public.gallery_album_add_images(
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
  v_existing integer;
  v_capacity integer;
  v_max_pos integer;
  v_added integer := 0;
  v_cover uuid;
  v_id uuid;
  v_pos integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_album_id is null then
    return 0;
  end if;

  if not exists (
    select 1 from public.gallery_albums ga where ga.id = p_album_id
  ) then
    raise exception 'Album not found';
  end if;

  -- INSERT under RLS raises for non-owners; soft-return 0 like bulk remove's
  -- DELETE no-op so callers can treat denial as "added nothing".
  if not exists (
    select 1
    from public.gallery_albums ga
    where ga.id = p_album_id
      and (
        ga.created_by = auth.uid()
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.is_admin = true
        )
      )
  ) then
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

  select count(*)::integer
  into v_existing
  from public.gallery_album_images gai
  where gai.album_id = p_album_id;

  v_capacity := greatest(0, 200 - coalesce(v_existing, 0));
  if v_capacity = 0 then
    raise exception 'At most 200 photos per album';
  end if;

  select coalesce(max(gai.position), -1)
  into v_max_pos
  from public.gallery_album_images gai
  where gai.album_id = p_album_id;

  v_pos := v_max_pos;

  for v_id in
    select candidate
    from unnest(v_ids) as candidate
    where exists (
      select 1 from public.gallery_images gi where gi.id = candidate
    )
    and not exists (
      select 1
      from public.gallery_album_images gai
      where gai.album_id = p_album_id
        and gai.image_id = candidate
    )
    limit v_capacity
  loop
    v_pos := v_pos + 1;
    insert into public.gallery_album_images (
      album_id, image_id, position, added_by
    ) values (
      p_album_id, v_id, v_pos, auth.uid()
    );
    v_added := v_added + 1;
  end loop;

  if v_added = 0 then
    return 0;
  end if;

  select ga.cover_image_id
  into v_cover
  from public.gallery_albums ga
  where ga.id = p_album_id;

  if v_cover is null then
    select gai.image_id
    into v_cover
    from public.gallery_album_images gai
    where gai.album_id = p_album_id
    order by gai.position asc, gai.added_at asc, gai.image_id asc
    limit 1;

    update public.gallery_albums
    set
      cover_image_id = v_cover,
      updated_at = now()
    where id = p_album_id;
  else
    update public.gallery_albums
    set updated_at = now()
    where id = p_album_id;
  end if;

  return v_added;
end;
$$;

revoke all on function public.gallery_album_add_images(uuid, uuid[]) from public;
grant execute on function public.gallery_album_add_images(uuid, uuid[])
  to authenticated;

-- Wall covers for photos in an album (sequence → index-0 cover).
create or replace function public.gallery_wall_cover_ids_for_album(p_slug text)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select gi.id, gi.sequence_id
    from public.gallery_albums ga
    join public.gallery_album_images gai on gai.album_id = ga.id
    join public.gallery_images gi on gi.id = gai.image_id
    where ga.slug = lower(trim(p_slug))
  ),
  covers as (
    select
      case
        when m.sequence_id is null then m.id
        else (
          select c.id
          from public.gallery_images c
          where c.sequence_id = m.sequence_id
          order by
            c.sequence_index asc nulls first,
            c.created_at desc,
            c.id asc
          limit 1
        )
      end as cover_id
    from matched m
  )
  select distinct cover_id
  from covers
  where cover_id is not null;
$$;

revoke all on function public.gallery_wall_cover_ids_for_album(text) from public;
grant execute on function public.gallery_wall_cover_ids_for_album(text)
  to anon, authenticated, service_role;
