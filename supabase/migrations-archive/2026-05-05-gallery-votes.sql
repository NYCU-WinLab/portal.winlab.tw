-- gallery votes: each authenticated user can vote at most once per image.
create table public.gallery_image_votes (
  image_id    uuid not null references public.gallery_images(id) on delete cascade,
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (image_id, user_id)
);

create index gallery_image_votes_image_created_at
  on public.gallery_image_votes (image_id, created_at desc);

create index gallery_image_votes_user_created_at
  on public.gallery_image_votes (user_id, created_at desc);

alter table public.gallery_image_votes enable row level security;

-- Read: public (same as gallery images).
create policy "gallery_image_votes_select"
on public.gallery_image_votes for select
using (true);

-- Insert: signed-in user can only write their own vote row.
create policy "gallery_image_votes_insert"
on public.gallery_image_votes for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);
