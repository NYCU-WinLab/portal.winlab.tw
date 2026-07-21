-- Gallery comments with thread-style replies.
create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.gallery_images(id) on delete cascade,
  parent_id uuid references public.gallery_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gallery_comments_parent_not_self check (
    parent_id is null or parent_id <> id
  )
);

create index if not exists gallery_comments_image_created_idx
  on public.gallery_comments (image_id, created_at asc);

create index if not exists gallery_comments_parent_idx
  on public.gallery_comments (parent_id);

alter table public.gallery_comments enable row level security;

create policy "gallery_comments_select"
on public.gallery_comments for select
using (true);

create policy "gallery_comments_insert"
on public.gallery_comments for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

create policy "gallery_comments_delete"
on public.gallery_comments for delete
using (created_by = auth.uid());
