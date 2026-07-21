-- Admin pin photos to the top of the gallery wall (multiple allowed).

alter table public.gallery_images
  add column if not exists pinned_at timestamptz;

create index if not exists gallery_images_wall_pin_idx
  on public.gallery_images (pinned_at desc nulls last, created_at desc)
  where (sequence_id is null or sequence_index = 0);

create or replace function public.gallery_admin_set_image_pin(
  p_image_id uuid,
  p_pinned boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cover_id uuid;
begin
  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Forbidden';
  end if;

  select gi.id
  into v_cover_id
  from public.gallery_images gi
  where gi.id = p_image_id;

  if v_cover_id is null then
    raise exception 'Image not found';
  end if;

  if exists (
    select 1
    from public.gallery_images
    where id = p_image_id
      and sequence_id is not null
      and sequence_index is not null
      and sequence_index <> 0
  ) then
    select id
    into v_cover_id
    from public.gallery_images
    where sequence_id = (
      select sequence_id from public.gallery_images where id = p_image_id
    )
    and sequence_index = 0
    limit 1;
  end if;

  if v_cover_id is null then
    raise exception 'Image not found';
  end if;

  update public.gallery_images
  set pinned_at = case when p_pinned then now() else null end
  where id = v_cover_id;
end;
$$;

revoke all on function public.gallery_admin_set_image_pin(uuid, boolean) from public;
grant execute on function public.gallery_admin_set_image_pin(uuid, boolean) to authenticated;

-- Rank of a wall cover row under pinned-first sort (for deep links + infinite scroll).
create or replace function public.gallery_wall_cover_rank(p_image_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select
      gi.id,
      gi.pinned_at,
      gi.created_at
    from public.gallery_images gi
    where gi.id = (
      case
        when exists (
          select 1
          from public.gallery_images x
          where x.id = p_image_id
            and x.sequence_id is not null
            and x.sequence_index is not null
            and x.sequence_index <> 0
        ) then (
          select c.id
          from public.gallery_images c
          where c.sequence_id = (
            select sequence_id from public.gallery_images where id = p_image_id
          )
          and c.sequence_index = 0
          limit 1
        )
        else p_image_id
      end
    )
    and (gi.sequence_id is null or gi.sequence_index = 0)
  )
  select count(*) + 1
  from public.gallery_images gi
  cross join target t
  where (gi.sequence_id is null or gi.sequence_index = 0)
    and gi.id <> t.id
    and (
      (gi.pinned_at is not null and t.pinned_at is null)
      or (
        gi.pinned_at is not null
        and t.pinned_at is not null
        and (
          gi.pinned_at > t.pinned_at
          or (gi.pinned_at = t.pinned_at and gi.created_at > t.created_at)
          or (gi.pinned_at = t.pinned_at and gi.created_at = t.created_at and gi.id > t.id)
        )
      )
      or (
        gi.pinned_at is null
        and t.pinned_at is null
        and (
          gi.created_at > t.created_at
          or (gi.created_at = t.created_at and gi.id > t.id)
        )
      )
    );
$$;

revoke all on function public.gallery_wall_cover_rank(uuid) from public;
grant execute on function public.gallery_wall_cover_rank(uuid) to anon, authenticated;
