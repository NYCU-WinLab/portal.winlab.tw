-- Admin delete for unused tags (use_count = 0). Members still cannot
-- remove catalog rows; only is_admin via this SECURITY DEFINER RPC.

create or replace function public.gallery_admin_delete_unused_tag(
  p_tag_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_use_count integer;
begin
  if not exists (
    select 1
    from public.user_profiles
    where user_profiles.id = auth.uid() and user_profiles.is_admin = true
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1 from public.gallery_tags t where t.id = p_tag_id
  ) then
    raise exception 'Tag not found';
  end if;

  select count(*)::integer into v_use_count
  from public.gallery_image_tags
  where tag_id = p_tag_id;

  if coalesce(v_use_count, 0) > 0 then
    raise exception 'Tag still in use';
  end if;

  delete from public.gallery_tags where id = p_tag_id;
end;
$$;

revoke all on function public.gallery_admin_delete_unused_tag(uuid) from public;
grant execute on function public.gallery_admin_delete_unused_tag(uuid)
  to authenticated;
