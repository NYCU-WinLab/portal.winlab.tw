-- Which GitLab issues a meeting belongs to.
--
-- Added ahead of the picker UI so the read-only endpoint GitLab polls has a
-- stable shape from its first request: an always-present empty array beats a
-- field that appears later and makes the consumer branch on its absence.
--
-- Plain text[] of issue references rather than a join table: there are a
-- handful per booking at most, nothing queries by issue, and the values are
-- owned by GitLab — Portal stores them, it doesn't resolve them.

alter table public.rooms_bookings
  add column if not exists issue_refs text[] not null default '{}';

alter table public.rooms_recurring_meetings
  add column if not exists issue_refs text[] not null default '{}';

-- Same least-privilege shape as the rest of these columns: readable by
-- anyone signed in, written only through the server.
grant select (issue_refs) on public.rooms_bookings to authenticated;
grant select (issue_refs) on public.rooms_recurring_meetings to authenticated;
