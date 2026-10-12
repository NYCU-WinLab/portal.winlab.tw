-- Admin checks read is_admin / roles through SECURITY DEFINER helpers, so a
-- later migration can take those two columns away from `authenticated`
-- without breaking the policies that used to read them as the caller.
--
-- Fourteen RLS policies on bento / gallery / members subqueried
-- user_profiles.is_admin / roles directly, and two gallery functions did the
-- same in their bodies. They now call is_portal_admin(), the new
-- is_bento_admin(), or has_role(), all definer. The rewritten policies apply
-- to `authenticated` only: anon can never be an admin, and the helpers are not
-- anon-callable.
--
-- members: "Admins can manage members" was
--   exists (select 1 from user_profiles
--            where (id = auth.uid() and roles->>'directory' = '"admin"')
--               or is_admin = true)
-- The is_admin branch was not tied to the caller, so with any super admin in
-- the table every member passed and could write or delete directory rows; the
-- directory branch never matched (->> on an array). It now means what it said.
--
-- get_my_access() hands the caller their own is_admin and roles, which is
-- what the apps' admin hooks and server checks read today.

create or replace function public.is_bento_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(auth.uid(), 'bento', 'admin') or public.is_portal_admin();
$$;

revoke all on function public.is_bento_admin() from public, anon;
grant execute on function public.is_bento_admin() to authenticated, service_role;

create or replace function public.get_my_access()
returns table (is_admin boolean, roles jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(up.is_admin, false), coalesce(up.roles, '{}'::jsonb)
    from public.user_profiles up
   where up.id = auth.uid();
$$;

revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated, service_role;

-- ── bento ───────────────────────────────────────────────────────────────────
drop policy "Admins can manage menu items" on public.bento_menu_items;
create policy "Admins can manage menu items" on public.bento_menu_items
  for all to authenticated
  using ((select public.is_bento_admin())) with check ((select public.is_bento_admin()));

drop policy "Admins can insert menus" on public.bento_menus;
create policy "Admins can insert menus" on public.bento_menus
  for insert to authenticated with check ((select public.is_bento_admin()));

drop policy "Admins can update menus" on public.bento_menus;
create policy "Admins can update menus" on public.bento_menus
  for update to authenticated using ((select public.is_bento_admin()));

drop policy "Admins can delete menus" on public.bento_menus;
create policy "Admins can delete menus" on public.bento_menus
  for delete to authenticated using ((select public.is_bento_admin()));

drop policy "Admins can manage orders" on public.bento_orders;
create policy "Admins can manage orders" on public.bento_orders
  for all to authenticated
  using ((select public.is_bento_admin())) with check ((select public.is_bento_admin()));

-- ── gallery ─────────────────────────────────────────────────────────────────
drop policy gallery_album_images_delete on public.gallery_album_images;
create policy gallery_album_images_delete on public.gallery_album_images
  for delete to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.gallery_albums ga
       where ga.id = gallery_album_images.album_id
         and (ga.created_by = auth.uid() or (select public.is_portal_admin()))
    )
  );

drop policy gallery_album_images_insert on public.gallery_album_images;
create policy gallery_album_images_insert on public.gallery_album_images
  for insert to authenticated
  with check (
    auth.uid() is not null
    and added_by = auth.uid()
    and exists (
      select 1 from public.gallery_images gi
       where gi.id = gallery_album_images.image_id
    )
    and exists (
      select 1 from public.gallery_albums ga
       where ga.id = gallery_album_images.album_id
         and (ga.created_by = auth.uid() or (select public.is_portal_admin()))
    )
  );

drop policy gallery_album_images_update on public.gallery_album_images;
create policy gallery_album_images_update on public.gallery_album_images
  for update to authenticated
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.gallery_albums ga
       where ga.id = gallery_album_images.album_id
         and (ga.created_by = auth.uid() or (select public.is_portal_admin()))
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.gallery_albums ga
       where ga.id = gallery_album_images.album_id
         and (ga.created_by = auth.uid() or (select public.is_portal_admin()))
    )
  );

drop policy gallery_albums_delete on public.gallery_albums;
create policy gallery_albums_delete on public.gallery_albums
  for delete to authenticated
  using (auth.uid() is not null and (created_by = auth.uid() or (select public.is_portal_admin())));

drop policy gallery_albums_update on public.gallery_albums;
create policy gallery_albums_update on public.gallery_albums
  for update to authenticated
  using (auth.uid() is not null and (created_by = auth.uid() or (select public.is_portal_admin())))
  with check (auth.uid() is not null and (created_by = auth.uid() or (select public.is_portal_admin())));

drop policy gallery_image_tags_delete on public.gallery_image_tags;
create policy gallery_image_tags_delete on public.gallery_image_tags
  for delete to authenticated
  using (
    auth.uid() is not null
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.gallery_images gi
         where gi.id = gallery_image_tags.image_id
           and gi.created_by = auth.uid()
      )
      or (select public.is_portal_admin())
    )
  );

drop policy gallery_settings_insert on public.gallery_settings;
create policy gallery_settings_insert on public.gallery_settings
  for insert to authenticated with check ((select public.is_portal_admin()));

drop policy gallery_settings_update on public.gallery_settings;
create policy gallery_settings_update on public.gallery_settings
  for update to authenticated
  using ((select public.is_portal_admin())) with check ((select public.is_portal_admin()));

-- ── members ─────────────────────────────────────────────────────────────────
drop policy "Admins can manage members" on public.members;
create policy "Admins can manage members" on public.members
  for all to authenticated
  using ((select public.has_role(auth.uid(), 'directory', 'admin')) or (select public.is_portal_admin()))
  with check ((select public.has_role(auth.uid(), 'directory', 'admin')) or (select public.is_portal_admin()));

-- ── user_profiles ───────────────────────────────────────────────────────────
-- Subsumed by "Authenticated users can view all profiles for document signing".
drop policy "Users can view names in shared orders" on public.user_profiles;

-- ── gallery functions: same bodies, admin check through the helper ─────────
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
        or public.is_portal_admin()
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
        or public.is_portal_admin()
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


