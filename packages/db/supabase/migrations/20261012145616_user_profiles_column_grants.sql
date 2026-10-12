-- Signed-in members get the user_profiles columns the portal actually reads,
-- and may write only their own door settings.
--
-- Until now `authenticated` held table-wide SELECT under a USING (true)
-- policy, so any member could read every column of every row — including the
-- LINE / Telegram / Discord ids, claude_session_id and the bot state columns,
-- which nothing in the web app or the MCP server reads as a member. #347 did
-- this for anon; this is the same move one trust level up.
--
-- Table-wide UPDATE went with it. The own-row policy kept members to their own
-- row and prevent_role_escalation pinned roles / is_admin / lab_status, but
-- name, email and username were left writable, so a member could rename
-- themselves (or take someone else's username) until their next Keycloak
-- sign-in synced it back. Those columns are written only by
-- sync_user_profile_username() and handle_new_user(), both SECURITY DEFINER,
-- so they don't need the member's grant.
--
-- Kept readable for every row, because the apps need them today:
--   id, name                       display names everywhere
--   email, username                approve / reimburse pickers, room invites
--   lab_status, lab_status_synced_at
--                                  meetings pickers and the two meetings views
--   is_admin, roles                own-row admin checks in hooks, and the
--                                  bento / gallery / members RLS policies that
--                                  subquery them as the caller (phase 2 moves
--                                  those onto the definer helpers first)
--   door_*                         /profile reads the member's own settings
-- Dropped: line_user_id, telegram_user_id, discord_user_id, claude_session_id,
-- active_workflow, last_active_platform, created_at. service_role is untouched,
-- so the bots that use those columns keep working.
--
-- INSERT and DELETE have no policy for authenticated, so RLS already refused
-- them; the grants go too, so nothing depends on that alone.

revoke all on table public.user_profiles from authenticated;

grant select (
  id, name, email, username,
  lab_status, lab_status_synced_at,
  is_admin, roles,
  door_greeting_suffix, door_greeting_color, door_sound_path, door_sound_mode
) on table public.user_profiles to authenticated;

grant update (
  door_greeting_suffix, door_greeting_color, door_sound_path, door_sound_mode
) on table public.user_profiles to authenticated;
