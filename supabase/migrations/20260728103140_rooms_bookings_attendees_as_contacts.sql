-- attendees was uuid[] referencing user_profiles, which forced every
-- attendee to already have a Portal account. That constraint was an
-- artefact of the storage choice, not a real rule: someone in a Keycloak
-- project group who has never signed into Portal is still a legitimate
-- person to invite to a meeting, and the old shape silently dropped them.
--
-- What an invite actually needs is a name and an address, both of which
-- Keycloak hands over directly. Storing those removes the lookup — and the
-- whole class of "couldn't match this member" failures — from the path.

alter table public.rooms_bookings
  add column if not exists attendee_contacts jsonb not null default '[]'::jsonb;

-- Carry existing bookings over by resolving their uuids back to the profile
-- they pointed at. Anything unresolvable is skipped rather than written as a
-- null-shaped entry.
update public.rooms_bookings b
set attendee_contacts = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object('name', coalesce(p.name, p.email), 'email', p.email)
      order by p.name
    )
    from unnest(b.attendees) as a(uid)
    join public.user_profiles p on p.id = a.uid
    where p.email is not null
  ),
  '[]'::jsonb
)
where b.attendees <> '{}';

alter table public.rooms_bookings drop column attendees;
alter table public.rooms_bookings rename column attendee_contacts to attendees;
