-- Which deliverables a meeting is expected to produce.
--
-- These become scoped labels (Deliverable::*) on the GitLab issue, so the
-- values are GitLab's vocabulary, not ours. Portal stores and forwards them;
-- the server rejects anything outside the known set before it gets here,
-- because a value that reaches GitLab becomes a label.

alter table public.rooms_bookings
  add column if not exists deliverables text[] not null default '{}';

alter table public.rooms_recurring_meetings
  add column if not exists deliverables text[] not null default '{}';

grant select (deliverables) on public.rooms_bookings to authenticated;
grant select (deliverables) on public.rooms_recurring_meetings to authenticated;
