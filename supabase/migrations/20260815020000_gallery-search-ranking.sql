-- Ranked wall search: title matches before tag matches; stable by recency.
-- Still returns setof uuid so existing callers keep working; ORDER BY is part
-- of the result stream PostgREST preserves.

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
      end as pat,
      lower(q.raw) as needle
    from q
  ),
  matched as (
    select
      gi.id,
      gi.sequence_id,
      gi.created_at,
      gi.pinned_at,
      case
        when lower(gi.name) = p.needle then 0
        when lower(gi.name) like (p.needle || '%') escape '\' then 1
        when gi.name ilike p.pat escape '\' then 2
        else 3
      end as rank_score
    from public.gallery_images gi
    cross join pattern p
    where p.pat is not null
      and gi.name ilike p.pat escape '\'

    union all

    select
      gi.id,
      gi.sequence_id,
      gi.created_at,
      gi.pinned_at,
      3 as rank_score
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
      end as cover_id,
      min(m.rank_score) as rank_score,
      max(m.pinned_at) as pinned_at,
      max(m.created_at) as created_at
    from matched m
    group by 1
  )
  select cover_id
  from covers
  where cover_id is not null
  order by
    rank_score asc,
    pinned_at desc nulls last,
    created_at desc,
    cover_id asc;
$$;

revoke all on function public.gallery_wall_cover_ids_for_query(text) from public;
grant execute on function public.gallery_wall_cover_ids_for_query(text)
  to anon, authenticated, service_role;
