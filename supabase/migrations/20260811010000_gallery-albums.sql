-- Gallery albums: owner-curated ordered collections with shareable slugs.
-- Distinct from tags (labels) and sequences (burst uploads).

create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  description text,
  cover_image_id uuid references public.gallery_images(id) on delete set null,
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gallery_albums_title_len check (
    char_length(trim(title)) between 1 and 80
  ),
  constraint gallery_albums_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 80
  ),
  constraint gallery_albums_description_len check (
    description is null or char_length(description) <= 500
  )
);

create unique index if not exists gallery_albums_slug_unique
  on public.gallery_albums (slug);

create index if not exists gallery_albums_created_by_idx
  on public.gallery_albums (created_by, updated_at desc);

create index if not exists gallery_albums_updated_at_idx
  on public.gallery_albums (updated_at desc);

create table if not exists public.gallery_album_images (
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  image_id uuid not null references public.gallery_images(id) on delete cascade,
  position integer not null default 0,
  added_by uuid not null references public.user_profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (album_id, image_id),
  constraint gallery_album_images_position_nonneg check (position >= 0)
);

create index if not exists gallery_album_images_album_pos_idx
  on public.gallery_album_images (album_id, position, added_at);

create index if not exists gallery_album_images_image_idx
  on public.gallery_album_images (image_id);

alter table public.gallery_albums enable row level security;
alter table public.gallery_album_images enable row level security;

grant select on public.gallery_albums to anon, authenticated, service_role;
grant insert, update, delete on public.gallery_albums
  to authenticated, service_role;

grant select on public.gallery_album_images to anon, authenticated, service_role;
grant insert, update, delete on public.gallery_album_images
  to authenticated, service_role;

create policy "gallery_albums_select"
on public.gallery_albums for select
using (true);

create policy "gallery_albums_insert"
on public.gallery_albums for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

create policy "gallery_albums_update"
on public.gallery_albums for update
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.is_admin = true
    )
  )
)
with check (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.is_admin = true
    )
  )
);

create policy "gallery_albums_delete"
on public.gallery_albums for delete
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.is_admin = true
    )
  )
);

create policy "gallery_album_images_select"
on public.gallery_album_images for select
using (true);

create policy "gallery_album_images_insert"
on public.gallery_album_images for insert
with check (
  auth.uid() is not null
  and added_by = auth.uid()
  and exists (
    select 1 from public.gallery_images gi where gi.id = image_id
  )
  and exists (
    select 1
    from public.gallery_albums ga
    where ga.id = album_id
      and (
        ga.created_by = auth.uid()
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.is_admin = true
        )
      )
  )
);

create policy "gallery_album_images_update"
on public.gallery_album_images for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.gallery_albums ga
    where ga.id = album_id
      and (
        ga.created_by = auth.uid()
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.is_admin = true
        )
      )
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.gallery_albums ga
    where ga.id = album_id
      and (
        ga.created_by = auth.uid()
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.is_admin = true
        )
      )
  )
);

create policy "gallery_album_images_delete"
on public.gallery_album_images for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.gallery_albums ga
    where ga.id = album_id
      and (
        ga.created_by = auth.uid()
        or exists (
          select 1
          from public.user_profiles up
          where up.id = auth.uid()
            and up.is_admin = true
        )
      )
  )
);

-- Keep updated_at fresh when membership changes.
create or replace function public.gallery_albums_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gallery_albums
  set updated_at = now()
  where id = coalesce(new.album_id, old.album_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists gallery_album_images_touch_album on public.gallery_album_images;
create trigger gallery_album_images_touch_album
after insert or update or delete on public.gallery_album_images
for each row
execute function public.gallery_albums_touch_updated_at();

-- Album catalog for the /albums index (cover path + photo count).
create or replace function public.gallery_list_albums(p_limit int default 60)
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  cover_image_path text,
  cover_media_type text,
  cover_poster_path text,
  photo_count bigint,
  created_by uuid,
  owner_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ga.id,
    ga.title,
    ga.slug,
    ga.description,
    coalesce(cover.image_path, first_img.image_path) as cover_image_path,
    coalesce(cover.media_type, first_img.media_type) as cover_media_type,
    coalesce(cover.poster_path, first_img.poster_path) as cover_poster_path,
    coalesce(counts.photo_count, 0)::bigint as photo_count,
    ga.created_by,
    coalesce(up.name, 'Someone') as owner_name,
    ga.created_at,
    ga.updated_at
  from public.gallery_albums ga
  left join public.user_profiles up on up.id = ga.created_by
  left join public.gallery_images cover on cover.id = ga.cover_image_id
  left join lateral (
    select count(*)::bigint as photo_count
    from public.gallery_album_images gai
    where gai.album_id = ga.id
  ) counts on true
  left join lateral (
    select gi.image_path, gi.media_type, gi.poster_path
    from public.gallery_album_images gai
    join public.gallery_images gi on gi.id = gai.image_id
    where gai.album_id = ga.id
    order by gai.position asc, gai.added_at asc, gi.id asc
    limit 1
  ) first_img on true
  order by ga.updated_at desc, ga.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

revoke all on function public.gallery_list_albums(int) from public;
grant execute on function public.gallery_list_albums(int)
  to anon, authenticated, service_role;

-- Ordered photos for a shareable album page.
create or replace function public.gallery_album_photos(p_slug text)
returns table (
  image_id uuid,
  name text,
  image_path text,
  media_type text,
  poster_path text,
  uploader_name text,
  created_by uuid,
  created_at timestamptz,
  position integer,
  added_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    gi.id as image_id,
    gi.name,
    gi.image_path,
    gi.media_type,
    gi.poster_path,
    coalesce(up.name, 'Someone') as uploader_name,
    gi.created_by,
    gi.created_at,
    gai.position,
    gai.added_at
  from public.gallery_albums ga
  join public.gallery_album_images gai on gai.album_id = ga.id
  join public.gallery_images gi on gi.id = gai.image_id
  left join public.user_profiles up on up.id = gi.created_by
  where ga.slug = lower(trim(p_slug))
  order by gai.position asc, gai.added_at asc, gi.id asc;
$$;

revoke all on function public.gallery_album_photos(text) from public;
grant execute on function public.gallery_album_photos(text)
  to anon, authenticated, service_role;
