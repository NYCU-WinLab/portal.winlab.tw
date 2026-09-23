-- The door's 32x32 LED panel shows three 10 px lines on every open: 歡迎, the
-- member's name, and a suffix. The suffix used to be a static file on the
-- panel service; this column lets each member set their own on /profile. Null
-- means "use the panel's default" (！！), which the service owns.
--
-- The check mirrors apps/portal/lib/door/greeting-suffix.ts. The panel font is
-- 10 px wide for Han / full-width glyphs and 5 px for printable ASCII, and a
-- line is 32 px, so the width is 10 per character minus 5 per printable ASCII
-- character: at most 3 Han, 6 ASCII, or a mix that fits. The app normalises
-- (NFC, trim, empty to null) before writing; this is the backstop, so its
-- whitespace and control-character sets are deliberately subsets of what the
-- app rejects, never supersets, and a value the app accepts always passes.
--
-- No policy or grant changes. user_profiles_update_own already lets a member
-- update their own row and nobody else's, authenticated already holds
-- table-level UPDATE, and prevent_role_escalation keeps pinning roles /
-- is_admin / lab_status. A new column inherits exactly that. anon's
-- column-level SELECT stays (id, name), so the suffix is not readable
-- anonymously.

alter table public.user_profiles
  add column door_greeting_suffix text;

alter table public.user_profiles
  add constraint user_profiles_door_greeting_suffix_check check (
    door_greeting_suffix is null
    or (
      door_greeting_suffix <> ''
      and door_greeting_suffix !~ '^[    -   　]'
      and door_greeting_suffix !~ '[    -   　]$'
      and door_greeting_suffix !~ '[\u0001-\u001f\u007f-\u009f­​-‏ -‮⁠-⁯-﻿￹-￻]'
      and char_length(door_greeting_suffix) * 10
        - char_length(regexp_replace(door_greeting_suffix, '[^ -~]', '', 'g')) * 5
        <= 32
    )
  );

comment on column public.user_profiles.door_greeting_suffix is
  'Third line of the door LED panel greeting, set by the member on /profile. Null means the panel default (！！). Width <= 32 px: Han / full-width 10 px, printable ASCII 5 px. Read by GET /api/door/greetings.';
