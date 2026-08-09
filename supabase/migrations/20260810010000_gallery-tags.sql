-- Gallery tags: collaborative labels on images, shareable wall filter via slug.

create table if not exists public.gallery_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gallery_tags_name_len check (
    char_length(trim(name)) between 1 and 40
  ),
  constraint gallery_tags_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 40
  )
);

create unique index if not exists gallery_tags_slug_unique
  on public.gallery_tags (slug);

create index if not exists gallery_tags_name_lower_idx
  on public.gallery_tags (lower(name));

create table if not exists public.gallery_image_tags (
  image_id uuid not null references public.gallery_images(id) on delete cascade,
  tag_id uuid not null references public.gallery_tags(id) on delete cascade,
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (image_id, tag_id)
);

create index if not exists gallery_image_tags_tag_idx
  on public.gallery_image_tags (tag_id, image_id);

create index if not exists gallery_image_tags_image_idx
  on public.gallery_image_tags (image_id);

alter table public.gallery_tags enable row level security;
alter table public.gallery_image_tags enable row level security;

create policy "gallery_tags_select"
on public.gallery_tags for select
using (true);

create policy "gallery_tags_insert"
on public.gallery_tags for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

-- Tags are append-only labels; no authenticated update/delete of the catalog.

create policy "gallery_image_tags_select"
on public.gallery_image_tags for select
using (true);

create policy "gallery_image_tags_insert"
on public.gallery_image_tags for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and exists (
    select 1 from public.gallery_images gi where gi.id = image_id
  )
);

create policy "gallery_image_tags_delete"
on public.gallery_image_tags for delete
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from public.gallery_images gi
      where gi.id = image_id
        and gi.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.is_admin = true
    )
  )
);

-- Wall covers that match a tag on the cover itself or any sequence sibling.
create or replace function public.gallery_wall_cover_ids_for_tag(p_tag_slug text)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with tagged as (
    select gi.id, gi.sequence_id
    from public.gallery_image_tags git
    join public.gallery_tags gt on gt.id = git.tag_id
    join public.gallery_images gi on gi.id = git.image_id
    where gt.slug = lower(trim(p_tag_slug))
  ),
  covers as (
    select
      case
        when t.sequence_id is null then t.id
        else (
          select c.id
          from public.gallery_images c
          where c.sequence_id = t.sequence_id
          order by
            c.sequence_index asc nulls first,
            c.created_at desc,
            c.id asc
          limit 1
        )
      end as cover_id
    from tagged t
  )
  select distinct cover_id
  from covers
  where cover_id is not null;
$$;

revoke all on function public.gallery_wall_cover_ids_for_tag(text) from public;
grant execute on function public.gallery_wall_cover_ids_for_tag(text)
  to anon, authenticated, service_role;

-- Popular tags for the filter chip (usage desc, name asc).
create or replace function public.gallery_list_popular_tags(p_limit int default 40)
returns table (
  id uuid,
  name text,
  slug text,
  use_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gt.id,
    gt.name,
    gt.slug,
    count(git.image_id)::bigint as use_count
  from public.gallery_tags gt
  left join public.gallery_image_tags git on git.tag_id = gt.id
  group by gt.id, gt.name, gt.slug
  order by count(git.image_id) desc, gt.name asc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.gallery_list_popular_tags(int) from public;
grant execute on function public.gallery_list_popular_tags(int)
  to anon, authenticated, service_role;
