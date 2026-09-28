-- Wall covers: one row per sequence (lowest sequence_index) or each single.
-- Sequences missing index 0 used to vanish from the wall because the home
-- query only selected sequence_index = 0.

create or replace view public.gallery_wall_covers
with (security_invoker = true) as
select distinct on (coalesce(sequence_id, id))
  id,
  name,
  image_path,
  media_type,
  poster_path,
  duration_seconds,
  created_by,
  created_at,
  pinned_at,
  sequence_id,
  sequence_index
from public.gallery_images
order by
  coalesce(sequence_id, id),
  sequence_index asc nulls first,
  created_at desc,
  id asc;

grant select on public.gallery_wall_covers to anon, authenticated, service_role;

-- Resolve deep-link rank using the same representative-cover rule.
create or replace function public.gallery_wall_cover_rank(p_image_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  with resolved as (
    select
      case
        when gi.sequence_id is null then gi.id
        else (
          select c.id
          from public.gallery_images c
          where c.sequence_id = gi.sequence_id
          order by c.sequence_index asc nulls last, c.created_at desc, c.id asc
          limit 1
        )
      end as cover_id
    from public.gallery_images gi
    where gi.id = p_image_id
  ),
  target as (
    select
      w.id,
      w.pinned_at,
      w.created_at
    from public.gallery_wall_covers w
    join resolved r on r.cover_id = w.id
  )
  select count(*) + 1
  from public.gallery_wall_covers gi
  cross join target t
  where gi.id <> t.id
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
