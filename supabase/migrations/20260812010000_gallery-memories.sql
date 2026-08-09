-- Gallery Memories ("On this day"): capture-time column + Taipei MM-DD lookup.
-- Prefer EXIF taken_at from the browser upload path; fall back to created_at
-- so existing polaroids still surface on their upload anniversary.

alter table public.gallery_images
  add column if not exists taken_at timestamptz;

update public.gallery_images
set taken_at = created_at
where taken_at is null;

alter table public.gallery_images
  alter column taken_at set default now(),
  alter column taken_at set not null;

-- Expression index for anniversary lookups in lab-local calendar time.
create index if not exists gallery_images_taken_md_taipei_idx
  on public.gallery_images (
    (extract(month from (taken_at at time zone 'Asia/Taipei'))),
    (extract(day from (taken_at at time zone 'Asia/Taipei')))
  );

create index if not exists gallery_images_taken_at_idx
  on public.gallery_images (taken_at desc);

-- Keep the wall-covers view in sync so clients that select * still see taken_at.
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
  taken_at,
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

-- Past-year covers whose Taipei calendar day matches the requested MM-DD.
create or replace function public.gallery_memories_on_this_day(
  p_month integer,
  p_day integer,
  p_limit integer default 100
)
returns table (
  id uuid,
  name text,
  image_path text,
  media_type text,
  poster_path text,
  created_by uuid,
  created_at timestamptz,
  taken_at timestamptz,
  sequence_id uuid,
  sequence_index integer,
  memory_year integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with covers as (
    select distinct on (coalesce(gi.sequence_id, gi.id))
      gi.id,
      gi.name,
      gi.image_path,
      gi.media_type,
      gi.poster_path,
      gi.created_by,
      gi.created_at,
      gi.taken_at,
      gi.sequence_id,
      gi.sequence_index,
      extract(year from (gi.taken_at at time zone 'Asia/Taipei'))::integer
        as memory_year
    from public.gallery_images gi
    where p_month between 1 and 12
      and p_day between 1 and 31
      and extract(month from (gi.taken_at at time zone 'Asia/Taipei'))
        = p_month
      and extract(day from (gi.taken_at at time zone 'Asia/Taipei'))
        = p_day
      and extract(year from (gi.taken_at at time zone 'Asia/Taipei'))
        < extract(year from ((now() at time zone 'Asia/Taipei')))
    order by
      coalesce(gi.sequence_id, gi.id),
      gi.sequence_index asc nulls first,
      gi.taken_at desc,
      gi.id asc
  )
  select
    c.id,
    c.name,
    c.image_path,
    c.media_type,
    c.poster_path,
    c.created_by,
    c.created_at,
    c.taken_at,
    c.sequence_id,
    c.sequence_index,
    c.memory_year
  from covers c
  order by c.memory_year desc, c.taken_at desc, c.id asc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke all on function public.gallery_memories_on_this_day(integer, integer, integer)
  from public;
grant execute on function public.gallery_memories_on_this_day(integer, integer, integer)
  to anon, authenticated, service_role;

comment on column public.gallery_images.taken_at is
  'Capture time (EXIF) when known; otherwise upload time. Used by Memories.';
comment on function public.gallery_memories_on_this_day(integer, integer, integer) is
  'Wall-cover photos from prior years matching a Taipei calendar MM-DD.';
