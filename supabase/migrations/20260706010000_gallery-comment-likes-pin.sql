-- Comment likes and admin pin (one pinned top-level comment per image).

alter table public.gallery_comments
  add column if not exists pinned_at timestamptz;

create index if not exists gallery_comments_image_pinned_idx
  on public.gallery_comments (image_id, pinned_at desc nulls last);

create table if not exists public.gallery_comment_likes (
  comment_id uuid not null references public.gallery_comments(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists gallery_comment_likes_comment_idx
  on public.gallery_comment_likes (comment_id);

alter table public.gallery_comment_likes enable row level security;

create policy "gallery_comment_likes_select"
on public.gallery_comment_likes for select
using (true);

create policy "gallery_comment_likes_insert"
on public.gallery_comment_likes for insert
with check (auth.uid() is not null and user_id = auth.uid());

create policy "gallery_comment_likes_delete"
on public.gallery_comment_likes for delete
using (user_id = auth.uid());

create or replace function public.gallery_admin_set_comment_pin(
  p_comment_id uuid,
  p_pinned boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image_id uuid;
  v_parent_id uuid;
begin
  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Forbidden';
  end if;

  select image_id, parent_id
  into v_image_id, v_parent_id
  from public.gallery_comments
  where id = p_comment_id;

  if v_image_id is null then
    raise exception 'Comment not found';
  end if;

  if v_parent_id is not null then
    raise exception 'Only top-level comments can be pinned';
  end if;

  if p_pinned then
    update public.gallery_comments
    set pinned_at = null
    where image_id = v_image_id
      and pinned_at is not null;

    update public.gallery_comments
    set pinned_at = now()
    where id = p_comment_id;
  else
    update public.gallery_comments
    set pinned_at = null
    where id = p_comment_id;
  end if;
end;
$$;

revoke all on function public.gallery_admin_set_comment_pin(uuid, boolean) from public;
grant execute on function public.gallery_admin_set_comment_pin(uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.gallery_comment_likes;
