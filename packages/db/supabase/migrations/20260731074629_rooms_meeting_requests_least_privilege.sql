-- Supabase's default privileges had already granted `authenticated` full
-- SELECT/INSERT/UPDATE/DELETE on the table by the time the column grant in
-- the previous migration ran, and a column grant is additive — it doesn't
-- narrow a table-wide one. So callback_token_hash was readable by anyone
-- signed in, and only the absence of a write policy stood between a user and
-- rewriting a join_url to point at a meeting they control.
--
-- Same shape as #343 and #346: the grant was wider than intended and RLS was
-- doing all the work on its own. Revoke first, then grant exactly what's
-- needed.

revoke all on public.rooms_meeting_requests from authenticated;
revoke all on public.rooms_meeting_requests from anon;

-- Read-only, and never the credential hash. Every write goes through the
-- callback route or the trigger, both on the service-role client.
grant select (
  id, request_id, booking_id, status, stage, join_url, web_link,
  event_id, thread_id, options_applied, error_code, error_message,
  pipeline_id, pipeline_url, created_at, completed_at, notified_at
) on public.rooms_meeting_requests to authenticated;
