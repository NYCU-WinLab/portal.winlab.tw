-- The lab's default door sounds: the pool the door panel service picks from,
-- at random on every open, for a member who has no sound of their own
-- (voice_only, or a file that is gone). Until now the default was one file
-- baked into the panel service; this table lets door admins manage the pool
-- on /door/admin, and GET /api/door/greetings publishes the enabled ones as
-- "default". An empty pool (or none enabled) leaves the panel on its own
-- built-in sound.
--
-- Files live in the same private door-sounds bucket, under defaults/. No
-- member folder can be called that (member folders are their uuid), and the
-- path check on user_profiles.door_sound_path pins a member's own sound to
-- their own folder, so a member can never point their greeting at a default
-- file or the other way round.

create table public.door_default_sounds (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  path       text not null unique,
  enabled    boolean not null default true,
  created_by uuid references public.user_profiles (id) on delete set null
             default auth.uid(),
  created_at timestamptz not null default now(),
  constraint door_default_sounds_label_check check (
    label = btrim(label) and char_length(label) between 1 and 40
  ),
  constraint door_default_sounds_path_check check (
    path ~ '^defaults/[A-Za-z0-9_-]{1,64}\.(mp3|m4a|aac|wav|ogg)$'
  )
);

comment on table public.door_default_sounds is
  'Default door sounds the panel picks from at random for members without their own. Managed by door admins on /door/admin, published by GET /api/door/greetings.';
comment on column public.door_default_sounds.path is
  'Storage path in the private door-sounds bucket, defaults/<name>.<ext>. A fresh name per upload, so it doubles as the version the panel caches by.';
comment on column public.door_default_sounds.enabled is
  'Only enabled sounds are in the rotation. Disabling keeps the file for later.';

alter table public.door_default_sounds enable row level security;

create policy "door admins read door_default_sounds"
  on public.door_default_sounds for select to authenticated
  using (public.is_door_admin());

create policy "door admins add door_default_sounds"
  on public.door_default_sounds for insert to authenticated
  with check (public.is_door_admin());

create policy "door admins change door_default_sounds"
  on public.door_default_sounds for update to authenticated
  using (public.is_door_admin())
  with check (public.is_door_admin());

create policy "door admins remove door_default_sounds"
  on public.door_default_sounds for delete to authenticated
  using (public.is_door_admin());

-- Supabase's default privileges would hand anon full DML on a new table.
-- authenticated gets what the policies above need; path and created_by are
-- written once, so UPDATE is limited to the two columns an admin edits.
-- service_role reads it for the greetings endpoint and removes nothing.
revoke all on public.door_default_sounds
  from public, anon, authenticated, service_role;
grant select, insert, delete on public.door_default_sounds to authenticated;
grant update (label, enabled) on public.door_default_sounds to authenticated;
grant select on public.door_default_sounds to service_role;

-- A door admin uploads straight from the browser into defaults/, with the
-- same name rule as the path check. As with member sounds there is no SELECT
-- policy: the service role checks the upload, signs the players on
-- /door/admin and the panel's URLs, and removes a deleted sound's file.
create policy "door_sounds_insert_default"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'door-sounds'
    and name ~ '^defaults/[A-Za-z0-9_-]{1,64}\.(mp3|m4a|aac|wav|ogg)$'
    and public.is_door_admin()
  );
