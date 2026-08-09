-- Meeting title + attendees for a Portal-made booking. Both are Portal-side
-- only: the external system's own comment field is left empty on purpose
-- (per the feature request — the Portal record is the source of truth for
-- who/what, and that system doesn't need it).
--
-- Attendees are a uuid[] rather than a join table: this is a lab-sized list
-- picked in one dialog, always read back with its booking, and never queried
-- from the other direction.

alter table public.rooms_bookings
  add column if not exists title text,
  add column if not exists attendees uuid[] not null default '{}';
