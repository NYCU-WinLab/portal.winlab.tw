-- Online-only meetings, and the stored pieces of the Teams topic.
--
-- Until now a "booking" was by definition a reservation in the CS dept
-- system, so room and external_reservation_id were both NOT NULL. An
-- online-only meeting has neither. Rather than inventing a sentinel room,
-- both become nullable and a check keeps the two in step: either the row
-- reserved a room (both set) or it didn't (neither set). A row with one and
-- not the other would mean a reservation nobody can cancel.

alter table public.rooms_bookings
  alter column room drop not null,
  alter column external_reservation_id drop not null;

alter table public.rooms_bookings
  drop constraint if exists rooms_bookings_room_or_online;

alter table public.rooms_bookings
  add constraint rooms_bookings_room_or_online check (
    (room is not null and external_reservation_id is not null)
    or (room is null and external_reservation_id is null)
  );

-- The machine-readable half of the Teams topic, e.g. `tasa`. Stored rather
-- than recomputed because it names the recording file: recomputing it later
-- from an attendee list that has since changed would silently start filing
-- a series' recordings somewhere else.
--
-- Kept separate from `title` so the UI can render it as a fixed, un-editable
-- adornment — which is also what makes it un-spoofable, since the prefix
-- never comes from the same field as the text a person types.
alter table public.rooms_bookings
  add column if not exists meeting_prefix text;

alter table public.rooms_recurring_meetings
  add column if not exists meeting_prefix text;

-- Which Keycloak group the attendees came from, when they came from one.
-- The recurring cron builds each occurrence's topic a week later, long after
-- the picker that knew the answer has gone.
alter table public.rooms_recurring_meetings
  add column if not exists group_name text;

-- Whether this booking should get a Teams meeting at all.
alter table public.rooms_recurring_meetings
  add column if not exists online boolean not null default true;

-- Room-less rows are online meetings by definition; for the rest this
-- records what the person asked for.
alter table public.rooms_bookings
  add column if not exists online boolean not null default false;
