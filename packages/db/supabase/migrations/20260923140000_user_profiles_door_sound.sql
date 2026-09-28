-- Each member can upload a short sound on /profile that the door panel
-- service plays when they open the door, and pick how it plays:
--   sound_only        the sound instead of the spoken greeting
--   sound_then_voice  the sound, then the spoken "歡迎，<name>"
--   voice_only        the spoken greeting only (the default, and the only
--                     mode allowed without a sound)
-- The service trims anything past 10 seconds and levels the loudness; Portal
-- only stores the file.
--
-- Files live in a private bucket at <user_id>/<name>.<ext>. The path is kept
-- on user_profiles.door_sound_path and the check ties it to the row's own
-- folder, so a member cannot point their greeting at someone else's file by
-- writing the column directly. user_profiles_update_own already limits a
-- member to their own row, authenticated already holds table-level UPDATE and
-- prevent_role_escalation keeps pinning roles / is_admin / lab_status, so the
-- new columns need no policy or grant, same as door_greeting_suffix
-- (20260923120000). anon's column-level SELECT stays (id, name).

alter table public.user_profiles
  add column door_sound_path text,
  add column door_sound_mode text not null default 'voice_only';

alter table public.user_profiles
  add constraint user_profiles_door_sound_mode_check check (
    door_sound_mode in ('sound_only', 'sound_then_voice', 'voice_only')
  ),
  add constraint user_profiles_door_sound_path_check check (
    door_sound_path is null
    or door_sound_path ~ (
      '^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(mp3|m4a|aac|wav|ogg)$'
    )
  ),
  add constraint user_profiles_door_sound_needs_file_check check (
    door_sound_path is not null or door_sound_mode = 'voice_only'
  );

comment on column public.user_profiles.door_sound_path is
  'Storage path of the member''s door sound in the private door-sounds bucket, <user_id>/<name>.<ext>. Null means no sound. Set on /profile, signed for the panel by GET /api/door/greetings.';
comment on column public.user_profiles.door_sound_mode is
  'How the door panel greets this member: sound_only, sound_then_voice or voice_only. Anything but voice_only needs door_sound_path.';

-- The limits mirror apps/portal/lib/door/sound.ts and are what the storage
-- API enforces on upload, so a client that skips the browser check still
-- cannot store a large or non-audio file. Upserted so a bucket created by
-- hand in the dashboard ends up with the same settings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'door-sounds',
  'door-sounds',
  false,
  3145728,
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A member uploads straight from the browser into their own folder, with the
-- same name rule as the column check. There is deliberately no SELECT or
-- UPDATE policy: nobody but the service role reads these files (the panel
-- gets a signed URL, /profile signs the member's own file server-side), and
-- an upload never overwrites. The storage API also needs SELECT to delete, so
-- in practice Portal removes files with the service role after checking the
-- path is the member's; the DELETE policy keeps a member's own folder theirs
-- to clear if a SELECT policy is ever added.
create policy "door_sounds_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'door-sounds'
    and name ~ (
      '^' || (select auth.uid())::text
        || '/[A-Za-z0-9_-]{1,64}\.(mp3|m4a|aac|wav|ogg)$'
    )
  );

create policy "door_sounds_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'door-sounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
