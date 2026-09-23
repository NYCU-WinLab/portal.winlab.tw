-- The door sound keeps two modes: sound_only and voice_only. sound_then_voice
-- (the sound, then the spoken greeting) is dropped. A member who picked it
-- keeps their sound and plays it on its own, which is the closest remaining
-- mode; their row already has a path, so user_profiles_door_sound_needs_file_check
-- still holds.

update public.user_profiles
  set door_sound_mode = 'sound_only'
  where door_sound_mode = 'sound_then_voice';

alter table public.user_profiles
  drop constraint user_profiles_door_sound_mode_check;

alter table public.user_profiles
  add constraint user_profiles_door_sound_mode_check check (
    door_sound_mode in ('sound_only', 'voice_only')
  );

comment on column public.user_profiles.door_sound_mode is
  'How the door panel greets this member: sound_only or voice_only. sound_only needs door_sound_path.';
