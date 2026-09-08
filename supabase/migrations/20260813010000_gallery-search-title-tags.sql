-- Gallery wall search: match titles OR tags (sequence-aware cover resolution).
-- Trigram indexes keep ILIKE '%q%' usable as the wall grows.

create extension if not exists pg_trgm with schema extensions;

create index if not exists gallery_images_name_trgm_idx
  on public.gallery_images
  using gin (name extensions.gin_trgm_ops);

create index if not exists gallery_tags_name_trgm_idx
  on public.gallery_tags
  using gin (name extensions.gin_trgm_ops);

create index if not exists gallery_tags_slug_trgm_idx
  on public.gallery_tags
  using gin (slug extensions.gin_trgm_ops);

-- Wall covers whose title or any sequence-sibling tag matches the query.
create or replace function public.gallery_wall_cover_ids_for_query(p_query text)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select nullif(trim(p_query), '') as raw
  ),
  pattern as (
    select
      case
        when q.raw is null then null
        else '%' || replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pat
    from q
  ),
  matched as (
    select gi.id, gi.sequence_id
    from public.gallery_images gi
    cross join pattern p
    where p.pat is not null
      and gi.name ilike p.pat escape '\'

    union

    select gi.id, gi.sequence_id
    from public.gallery_image_tags git
    join public.gallery_tags gt on gt.id = git.tag_id
    join public.gallery_images gi on gi.id = git.image_id
    cross join pattern p
    where p.pat is not null
      and (
        gt.name ilike p.pat escape '\'
        or gt.slug ilike p.pat escape '\'
      )
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

revoke all on function public.gallery_wall_cover_ids_for_query(text) from public;
grant execute on function public.gallery_wall_cover_ids_for_query(text)
  to anon, authenticated, service_role;
