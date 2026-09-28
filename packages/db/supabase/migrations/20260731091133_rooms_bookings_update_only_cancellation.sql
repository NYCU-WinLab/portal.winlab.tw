-- The only update a person legitimately makes to a booking is cancelling it,
-- but the grant allowed updating every column of their own row. That made
-- `meeting_prefix` writable from the REST API — so the prefix that decides
-- which group a Teams recording files itself under could be pointed at
-- another group, which is exactly what storing it in its own field was
-- supposed to prevent.
--
-- The RLS policy already restricts updates to the owner's own rows. This
-- narrows *which columns* that update may touch. Everything else on the row
-- is written by the server (booking, meeting callback, invite sequencing)
-- through the service-role client.

revoke update on public.rooms_bookings from authenticated;

grant update (status, cancelled_at, cancelled_by)
  on public.rooms_bookings to authenticated;
