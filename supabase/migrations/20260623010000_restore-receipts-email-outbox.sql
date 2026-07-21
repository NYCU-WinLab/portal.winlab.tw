-- Restore receipts_email_outbox and its triggers.
--
-- The original migration (migrations-archive/2026-05-15-receipts-email-outbox.sql)
-- never made it into the squashed baseline (00000000000000_remote_baseline.sql),
-- so the table + triggers are missing from remote while the code that uses them
-- (app/api/cron/receipts-emails + lib/receipts/email-drain.ts) is still live.
-- Mirrors approve_email_outbox. See issue #209.
--
-- Idempotent (if not exists / or replace / drop trigger if exists) so it is safe
-- to run even if part of it already exists on a given environment.

-- =============================================================================
-- Stamp created_by on receipts INSERT. Client inserts leave created_by null;
-- SECURITY DEFINER so it reads auth.uid() regardless of future RLS lockdowns.
-- =============================================================================

create or replace function public.receipts_set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_receipts_set_created_by on public.receipts;
create trigger trg_receipts_set_created_by
before insert on public.receipts
for each row execute function public.receipts_set_created_by();

-- =============================================================================
-- Outbox table
-- =============================================================================

create table if not exists public.receipts_email_outbox (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  kind        text not null check (kind in ('receipt-uploaded')),
  attempts    int  not null default 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Hot path for the consumer: oldest unsent rows that haven't burned through retries.
create index if not exists receipts_email_outbox_pending
  on public.receipts_email_outbox (created_at)
  where sent_at is null and attempts < 5;

-- Lockdown. Only service_role (bypasses RLS) and the SECURITY DEFINER trigger
-- write/read this table. No policies = anon/authenticated get nothing — receipts
-- admins care about receipts, not the mail queue.
alter table public.receipts_email_outbox enable row level security;

-- =============================================================================
-- Enqueue trigger: every new receipt produces one outbox row.
-- =============================================================================

create or replace function public.receipts_enqueue_upload_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.receipts_email_outbox (receipt_id, kind)
  values (new.id, 'receipt-uploaded');
  return new;
end $$;

drop trigger if exists receipts_enqueue_upload_email on public.receipts;
create trigger receipts_enqueue_upload_email
after insert on public.receipts
for each row execute function public.receipts_enqueue_upload_email();
