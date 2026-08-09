-- The two identifiers the cancellation pipeline needs handed back to it.
--
-- Cancelling is not "delete by event_id": the pipeline wants EVENT_ID set to
-- the meeting's cancel_id (the 04000000… GlobalObjectId hex) and MESSAGE_ID
-- set to the channel post's id. The spec is explicit that the Outlook
-- event_id — the AAMkAG… one — is NOT what goes in EVENT_ID, so both are
-- stored under their own names rather than reusing the column we already had.

alter table public.rooms_meeting_requests
  add column if not exists cancel_id text,
  add column if not exists message_id text;

-- Same least-privilege shape as the rest of the table: readable, never
-- writable from the browser.
grant select (cancel_id, message_id)
  on public.rooms_meeting_requests to authenticated;
