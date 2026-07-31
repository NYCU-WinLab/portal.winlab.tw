-- Room for the cancellation pipeline that doesn't exist yet.
--
-- A cancel request has the same shape as a create: one-shot token, callback,
-- retries, and the same "never called back" failure mode. Giving the table a
-- `kind` means that pipeline reuses the whole callback route — auth,
-- idempotency, stuck sweep — instead of growing a parallel copy of it.

alter table public.rooms_meeting_requests
  drop constraint if exists rooms_meeting_requests_kind_check;

alter table public.rooms_meeting_requests
  add column if not exists kind text not null default 'create';

alter table public.rooms_meeting_requests
  add constraint rooms_meeting_requests_kind_check
    check (kind in ('create', 'cancel'));

-- Same least-privilege shape as the rest of the table: readable, never
-- writable from the browser.
grant select (kind) on public.rooms_meeting_requests to authenticated;
