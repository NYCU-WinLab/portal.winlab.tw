-- Teams meeting creation, driven by an external GitLab pipeline.
--
-- Channel meetings can't be created through Microsoft Graph, so a pipeline
-- signs in as a service account and drives the Teams API instead. It takes
-- tens of seconds to minutes, so the flow is: Portal triggers, gets a
-- pipeline id back immediately, and the pipeline POSTs the result to
-- /api/rooms/meeting-callback when it's done.
--
-- Its own table rather than columns on rooms_bookings: a request has a
-- lifecycle (pending -> success/failed), carries a credential, and may
-- outlive or precede the thing it's attached to.

create table if not exists public.rooms_meeting_requests (
  id uuid primary key default gen_random_uuid(),
  -- What we send as REQUEST_ID and the pipeline echoes back. The join key
  -- for the callback, so it has to be unique.
  request_id text not null unique,
  booking_id uuid references public.rooms_bookings(id) on delete cascade,

  -- SHA-256 of the one-shot bearer token handed to the pipeline. Only the
  -- hash is stored: the token itself travels as a GitLab pipeline variable,
  -- which is NOT masked and can surface in job logs, so it has to be worth
  -- as little as possible if it leaks — one booking, one use.
  callback_token_hash text not null,

  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  -- Which step the pipeline reached: starting|login|token|create|options|done.
  stage text,

  join_url text,
  web_link text,
  event_id text,
  thread_id text,
  -- False when the meeting exists but auto-recording/language didn't apply
  -- (error code OPTIONS_FAILED). Not a failure — re-triggering would create
  -- a duplicate meeting.
  options_applied boolean,

  error_code text,
  error_message text,

  pipeline_id text,
  pipeline_url text,

  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- When the creator was told this request failed, so the sweep doesn't mail
  -- them the same failure every day.
  notified_at timestamptz
);

-- The callback looks a row up by request_id on every retry; unique already
-- indexes it. This one serves the stuck-request sweep.
create index if not exists rooms_meeting_requests_pending
  on public.rooms_meeting_requests (created_at)
  where status = 'pending';

create index if not exists rooms_meeting_requests_booking
  on public.rooms_meeting_requests (booking_id);

-- RFC 5545 SEQUENCE for the booking's calendar invite. Stored rather than
-- derived because a booking can now be mailed more than twice: REQUEST on
-- booking, REQUEST again once the meeting URL arrives, CANCEL on cancellation.
-- A derived value would repeat a sequence and calendar clients would ignore
-- the later message — the cancellation would silently not remove the event.
alter table public.rooms_bookings
  add column if not exists invite_sequence smallint not null default 0;

alter table public.rooms_meeting_requests enable row level security;

-- Explicit, not inherited from Supabase defaults: a database built from these
-- migrations alone has no default privileges, and the defaults would also
-- hand anon a write grant held back only by RLS.
--
-- NOTE: this revoke was not enough on the live database — Supabase's default
-- privileges had already granted `authenticated` the full set, and a column
-- grant is additive rather than narrowing. The next migration
-- (rooms_meeting_requests_least_privilege) is what actually closed it.
revoke all on public.rooms_meeting_requests from anon;

-- Read-only for everyone signed in: the UI needs to show "meeting link is
-- being created" next to a booking. Writes belong to the callback route and
-- the trigger, both of which use the service-role client — no policy here
-- grants a user the ability to set a join_url.
grant select (
  id, request_id, booking_id, status, stage, join_url, web_link,
  event_id, thread_id, options_applied, error_code, error_message,
  pipeline_id, pipeline_url, created_at, completed_at, notified_at
) on public.rooms_meeting_requests to authenticated;

-- callback_token_hash is deliberately absent from that grant. It is only a
-- hash, but nothing in the browser has any use for it.

create policy "rooms_meeting_requests_select"
on public.rooms_meeting_requests for select
to authenticated
using (true);
