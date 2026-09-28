-- Personal favorites (saved photos) on the gallery wall.
-- Sequence-aware: saving any sibling surfaces the sequence cover in the Saved filter.

create table if not exists public.gallery_favorites (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  image_id uuid not null references public.gallery_images(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, image_id)
);

create index if not exists gallery_favorites_user_created_idx
  on public.gallery_favorites (user_id, created_at desc);

create index if not exists gallery_favorites_image_idx
  on public.gallery_favorites (image_id);

alter table public.gallery_favorites enable row level security;

grant select, insert, delete on public.gallery_favorites
  to authenticated, service_role;

create policy "gallery_favorites_select_own"
on public.gallery_favorites for select
using (auth.uid() = user_id);

create policy "gallery_favorites_insert_own"
on public.gallery_favorites for insert
with check (
  auth.uid() is not null
  and auth.uid() = user_id
  and exists (
    select 1 from public.gallery_images gi where gi.id = image_id
  )
);

create policy "gallery_favorites_delete_own"
on public.gallery_favorites for delete
using (auth.uid() = user_id);

-- Wall covers for the caller's favorites (sequence → index-0 cover).
create or replace function public.gallery_wall_cover_ids_for_favorites()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select gi.id, gi.sequence_id
    from public.gallery_favorites gf
    join public.gallery_images gi on gi.id = gf.image_id
    where gf.user_id = auth.uid()
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

revoke all on function public.gallery_wall_cover_ids_for_favorites() from public;
grant execute on function public.gallery_wall_cover_ids_for_favorites()
  to authenticated;
