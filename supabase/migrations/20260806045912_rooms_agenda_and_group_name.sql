-- What the meeting is for, and which Keycloak group it belongs to.
--
-- Both are handed to the GitLab pipeline, which opens the epic and issue on
-- its own side. GROUP_NAME is the Keycloak leaf only: the GitLab hierarchy is
-- three levels deep against Keycloak's one
-- (winlab/network-system-design-and-implementation/tasa-satsim vs
-- /winlab-projects/tasa-satsim), so concatenating a path here would produce
-- something that looks right and 404s. GitLab resolves the leaf itself.
--
-- group_name is stored separately from meeting_prefix because they diverge:
-- the prefix falls back to an attendee's username when no group was picked,
-- and a username is not a group.

alter table public.rooms_bookings
  add column if not exists agenda text,
  add column if not exists group_name text;

alter table public.rooms_recurring_meetings
  add column if not exists agenda text;

grant select (agenda, group_name) on public.rooms_bookings to authenticated;
grant select (agenda) on public.rooms_recurring_meetings to authenticated;
