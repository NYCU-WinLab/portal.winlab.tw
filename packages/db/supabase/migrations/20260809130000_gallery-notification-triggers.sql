-- Move gallery notification fan-out into Postgres.
--
-- Until now the app wrote gallery_activity_notifications /
-- gallery_comment_mentions through the service-role admin client after every
-- reaction, reply, comment like, and @mention. That path was easy to skip
-- (any future writer that forgot the sync) and hard to keep consistent with
-- RLS. SECURITY DEFINER triggers on the source tables make fan-out automatic
-- and keep the notification tables insert-locked to authenticated clients
-- (no INSERT/DELETE policies — only the triggers and service_role write).
--
-- Mentions are parsed with a POSIX pattern that mirrors the app's
-- `@([\p{L}\p{N}._-]{1,40})` extractor under a UTF-8 locale
-- (`[[:alnum:]._-]`). Name match is case-insensitive on trim(user_profiles.name);
-- the comment author is never notified of their own mention.

-- =============================================================================
-- Mentions: resolve @names in a comment body → gallery_comment_mentions rows
-- =============================================================================

create or replace function public.gallery_sync_comment_mentions(
  p_comment_id uuid,
  p_body text,
  p_author_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_ids uuid[];
begin
  select coalesce(array_agg(distinct up.id), '{}'::uuid[])
  into target_ids
  from regexp_matches(p_body, '@([[:alnum:]._-]{1,40})', 'g') as m(name_match)
  join public.user_profiles up
    on lower(trim(up.name)) = lower(m.name_match[1])
  where up.id <> p_author_id
    and up.name is not null
    and length(trim(up.name)) > 0;

  if coalesce(cardinality(target_ids), 0) = 0 then
    delete from public.gallery_comment_mentions
    where comment_id = p_comment_id;
    return;
  end if;

  delete from public.gallery_comment_mentions
  where comment_id = p_comment_id
    and not (mentioned_user_id = any (target_ids));

  insert into public.gallery_comment_mentions (comment_id, mentioned_user_id)
  select p_comment_id, uid
  from unnest(target_ids) as uid
  on conflict (comment_id, mentioned_user_id) do nothing;
end;
$$;

revoke all on function public.gallery_sync_comment_mentions(uuid, text, uuid) from public;
revoke all on function public.gallery_sync_comment_mentions(uuid, text, uuid) from anon, authenticated;

-- =============================================================================
-- Comments: reply notification on insert + mention sync on insert/update
-- =============================================================================

create or replace function public.gallery_notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    select c.created_by into v_parent_author
    from public.gallery_comments c
    where c.id = new.parent_id;

    if v_parent_author is not null and v_parent_author <> new.created_by then
      insert into public.gallery_activity_notifications (
        recipient_user_id,
        kind,
        image_id,
        comment_id,
        actor_user_id,
        body
      )
      values (
        v_parent_author,
        'reply',
        new.image_id,
        new.id,
        new.created_by,
        left(new.body, 200)
      )
      on conflict (comment_id, recipient_user_id) where (kind = 'reply')
      do nothing;
    end if;
  end if;

  -- Mentions on create and on body edit. Delete cascades clean up on comment delete.
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.body is distinct from old.body) then
    perform public.gallery_sync_comment_mentions(new.id, new.body, new.created_by);
  end if;

  return new;
end;
$$;

drop trigger if exists gallery_notify_on_comment on public.gallery_comments;
create trigger gallery_notify_on_comment
after insert or update of body on public.gallery_comments
for each row execute function public.gallery_notify_on_comment();

revoke all on function public.gallery_notify_on_comment() from public;
revoke all on function public.gallery_notify_on_comment() from anon, authenticated;

-- =============================================================================
-- Reactions: notify the image owner (skip self-reactions)
-- =============================================================================

create or replace function public.gallery_notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_actor_id uuid;
  v_image_id uuid;
  v_reaction text;
begin
  if tg_op = 'DELETE' then
    v_actor_id := old.user_id;
    v_image_id := old.image_id;
  else
    v_actor_id := new.user_id;
    v_image_id := new.image_id;
    v_reaction := new.reaction;
  end if;

  select gi.created_by into v_owner_id
  from public.gallery_images gi
  where gi.id = v_image_id;

  if v_owner_id is null or v_owner_id = v_actor_id then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.gallery_activity_notifications n
    where n.kind = 'reaction'
      and n.image_id = v_image_id
      and n.actor_user_id = v_actor_id
      and n.recipient_user_id = v_owner_id
      and n.read_at is null;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    update public.gallery_activity_notifications n
    set reaction = v_reaction,
        created_at = now()
    where n.kind = 'reaction'
      and n.image_id = v_image_id
      and n.actor_user_id = v_actor_id
      and n.recipient_user_id = v_owner_id
      and n.read_at is null;

    if found then
      return new;
    end if;
  end if;

  -- INSERT, or UPDATE that had no unread row to refresh.
  insert into public.gallery_activity_notifications (
    recipient_user_id,
    kind,
    image_id,
    actor_user_id,
    reaction
  )
  values (
    v_owner_id,
    'reaction',
    v_image_id,
    v_actor_id,
    v_reaction
  )
  on conflict (image_id, actor_user_id, recipient_user_id) where (kind = 'reaction')
  do nothing;

  return new;
end;
$$;

drop trigger if exists gallery_notify_on_reaction on public.gallery_image_votes;
create trigger gallery_notify_on_reaction
after insert or update or delete on public.gallery_image_votes
for each row execute function public.gallery_notify_on_reaction();

revoke all on function public.gallery_notify_on_reaction() from public;
revoke all on function public.gallery_notify_on_reaction() from anon, authenticated;

-- =============================================================================
-- Comment likes: notify the comment author (skip self-likes)
-- =============================================================================

create or replace function public.gallery_notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_author uuid;
  v_comment_image uuid;
  v_comment_body text;
  v_actor_id uuid;
  v_comment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_actor_id := old.user_id;
    v_comment_id := old.comment_id;
  else
    v_actor_id := new.user_id;
    v_comment_id := new.comment_id;
  end if;

  select c.created_by, c.image_id, c.body
  into v_comment_author, v_comment_image, v_comment_body
  from public.gallery_comments c
  where c.id = v_comment_id;

  if v_comment_author is null or v_comment_author = v_actor_id then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.gallery_activity_notifications n
    where n.kind = 'comment_like'
      and n.comment_id = v_comment_id
      and n.actor_user_id = v_actor_id
      and n.recipient_user_id = v_comment_author
      and n.read_at is null;
    return old;
  end if;

  insert into public.gallery_activity_notifications (
    recipient_user_id,
    kind,
    image_id,
    comment_id,
    actor_user_id,
    body
  )
  values (
    v_comment_author,
    'comment_like',
    v_comment_image,
    v_comment_id,
    v_actor_id,
    left(v_comment_body, 200)
  )
  on conflict (comment_id, actor_user_id, recipient_user_id) where (kind = 'comment_like')
  do nothing;

  return new;
end;
$$;

drop trigger if exists gallery_notify_on_comment_like on public.gallery_comment_likes;
create trigger gallery_notify_on_comment_like
after insert or delete on public.gallery_comment_likes
for each row execute function public.gallery_notify_on_comment_like();

revoke all on function public.gallery_notify_on_comment_like() from public;
revoke all on function public.gallery_notify_on_comment_like() from anon, authenticated;

comment on function public.gallery_sync_comment_mentions(uuid, text, uuid) is
  'Resolves @mentions in a gallery comment body and syncs gallery_comment_mentions. Called only from gallery_notify_on_comment.';
comment on function public.gallery_notify_on_comment() is
  'AFTER INSERT/UPDATE OF body on gallery_comments: reply notification + mention sync.';
comment on function public.gallery_notify_on_reaction() is
  'AFTER INSERT/UPDATE/DELETE on gallery_image_votes: reaction notification for the image owner.';
comment on function public.gallery_notify_on_comment_like() is
  'AFTER INSERT/DELETE on gallery_comment_likes: comment_like notification for the comment author.';
