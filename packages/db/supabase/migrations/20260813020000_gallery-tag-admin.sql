-- Admin tag rename + merge. Catalog stays append-only for members;
-- only is_admin may mutate/delete via SECURITY DEFINER RPCs.

create or replace function public.gallery_admin_rename_tag(
  p_tag_id uuid,
  p_new_name text
)
returns table (
  id uuid,
  name text,
  slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_slug text;
begin
  if not exists (
    select 1
    from public.user_profiles
    where user_profiles.id = auth.uid() and user_profiles.is_admin = true
  ) then
    raise exception 'Forbidden';
  end if;

  v_name := nullif(trim(regexp_replace(coalesce(p_new_name, ''), '\s+', ' ', 'g')), '');
  if v_name is null or char_length(v_name) > 40 then
    raise exception 'Invalid tag name';
  end if;

  v_slug := lower(v_name);
  v_slug := regexp_replace(v_slug, '[_\s]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '[^a-z0-9-]', '', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  v_slug := left(v_slug, 40);

  if v_slug is null
     or v_slug = ''
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  then
    raise exception 'Invalid tag name';
  end if;

  if not exists (
    select 1 from public.gallery_tags t where t.id = p_tag_id
  ) then
    raise exception 'Tag not found';
  end if;

  if exists (
    select 1
    from public.gallery_tags t
    where t.slug = v_slug
      and t.id <> p_tag_id
  ) then
    raise exception 'A tag with that name already exists';
  end if;

  update public.gallery_tags t
  set name = v_name, slug = v_slug
  where t.id = p_tag_id;

  return query
  select t.id, t.name, t.slug
  from public.gallery_tags t
  where t.id = p_tag_id;
end;
$$;

revoke all on function public.gallery_admin_rename_tag(uuid, text) from public;
grant execute on function public.gallery_admin_rename_tag(uuid, text)
  to authenticated;

create or replace function public.gallery_admin_merge_tags(
  p_source_id uuid,
  p_target_id uuid
)
returns table (
  id uuid,
  name text,
  slug text,
  moved_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved bigint := 0;
begin
  if not exists (
    select 1
    from public.user_profiles
    where user_profiles.id = auth.uid() and user_profiles.is_admin = true
  ) then
    raise exception 'Forbidden';
  end if;

  if p_source_id is null or p_target_id is null then
    raise exception 'Missing tag id';
  end if;

  if p_source_id = p_target_id then
    raise exception 'Cannot merge a tag into itself';
  end if;

  if not exists (
    select 1 from public.gallery_tags t where t.id = p_source_id
  ) then
    raise exception 'Source tag not found';
  end if;

  if not exists (
    select 1 from public.gallery_tags t where t.id = p_target_id
  ) then
    raise exception 'Target tag not found';
  end if;

  -- Drop links that would collide with an existing target attachment.
  delete from public.gallery_image_tags git
  where git.tag_id = p_source_id
    and exists (
      select 1
      from public.gallery_image_tags kept
      where kept.image_id = git.image_id
        and kept.tag_id = p_target_id
    );

  update public.gallery_image_tags git
  set tag_id = p_target_id
  where git.tag_id = p_source_id;

  get diagnostics v_moved = row_count;

  delete from public.gallery_tags t where t.id = p_source_id;

  return query
  select
    t.id,
    t.name,
    t.slug,
    v_moved
  from public.gallery_tags t
  where t.id = p_target_id;
end;
$$;

revoke all on function public.gallery_admin_merge_tags(uuid, uuid) from public;
grant execute on function public.gallery_admin_merge_tags(uuid, uuid)
  to authenticated;
