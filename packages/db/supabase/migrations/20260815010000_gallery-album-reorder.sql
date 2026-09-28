-- Atomic album photo reorder in one round-trip (owner/admin).
-- Replaces N per-row UPDATEs from the manage panel.

create or replace function public.gallery_album_reorder_images(
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
  v_updated integer := 0;
  v_i integer;
  v_expected integer;
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

  -- Soft-return for non-owners (RLS would no-op UPDATEs; match bulk add).
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

  -- Preserve caller order; drop nulls / dupes; cap at album max.
  select array_agg(candidate order by ord)
  into v_ids
  from (
    select u as candidate, min(ord) as ord
    from unnest(coalesce(p_image_ids, '{}'::uuid[])) with ordinality as t(u, ord)
    where u is not null
    group by u
    order by min(ord)
    limit 200
  ) ordered;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  select count(*)::integer
  into v_expected
  from public.gallery_album_images gai
  where gai.album_id = p_album_id;

  if v_expected = 0 then
    return 0;
  end if;

  if cardinality(v_ids) <> v_expected then
    raise exception 'Reorder payload must include every album photo exactly once';
  end if;

  if exists (
    select 1
    from unnest(v_ids) as candidate
    where not exists (
      select 1
      from public.gallery_album_images gai
      where gai.album_id = p_album_id
        and gai.image_id = candidate
    )
  ) then
    raise exception 'Reorder payload contains a photo that is not in this album';
  end if;

  -- Two-phase update avoids unique (album_id, position) collisions mid-pass.
  update public.gallery_album_images gai
  set position = position + 10000
  where gai.album_id = p_album_id;

  for v_i in 1 .. cardinality(v_ids) loop
    update public.gallery_album_images gai
    set position = v_i - 1
    where gai.album_id = p_album_id
      and gai.image_id = v_ids[v_i];
    v_updated := v_updated + 1;
  end loop;

  update public.gallery_albums
  set updated_at = now()
  where id = p_album_id;

  return v_updated;
end;
$$;

revoke all on function public.gallery_album_reorder_images(uuid, uuid[]) from public;
grant execute on function public.gallery_album_reorder_images(uuid, uuid[])
  to authenticated;
