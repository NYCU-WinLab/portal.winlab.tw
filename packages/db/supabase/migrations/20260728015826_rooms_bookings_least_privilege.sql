-- Drop the leftover default-privilege grants (DELETE/TRUNCATE/REFERENCES/
-- TRIGGER) that prod's rooms_bookings picked up at creation time, so prod
-- matches what a database built from these migrations alone would have —
-- the exact mismatch that made the previous migration necessary. Nothing
-- deletes from this table: cancellation is a status flip, so the row stays
-- as the audit record it exists to be.

revoke all on public.rooms_bookings from authenticated;
grant select, insert, update on public.rooms_bookings to authenticated;
