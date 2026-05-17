-- Outbox for receipts-app upload notifications.
-- Populated by a trigger on receipts INSERT.
-- Consumed by a Server Action `after()` hook + a daily Vercel Cron sweep
-- that both call Resend.
--
-- Why outbox instead of firing Resend inside the upload?
-- 1. The PDF upload + DB insert path stays fast — no waiting on SMTP.
-- 2. Resend / network failure doesn't roll back the receipt row.
-- 3. Retries are free: consumer re-reads rows whose sent_at is still null.
--
-- (Mirrors approve_email_outbox; if you're touching one, look at the other.)

-- =============================================================================
-- Cleanup the existing client-write hole: client INSERTs never filled
-- created_by, so every legacy row is NULL. Backfilling it is a separate job
-- (we don't have the audit trail to attribute old rows), but from now on the
-- column gets stamped automatically. SECURITY DEFINER because we read
-- auth.uid() — keeps behaviour stable even if a future RLS policy locks down
-- the schema further.
-- =============================================================================

create or replace function public.receipts_set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create trigger trg_receipts_set_created_by
before insert on public.receipts
for each row execute function public.receipts_set_created_by();

-- =============================================================================
-- Outbox table
-- =============================================================================

create table public.receipts_email_outbox (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  kind        text not null check (kind in ('receipt-uploaded')),
  attempts    int  not null default 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Hot path for the consumer: oldest unsent rows that haven't burned through retries.
create index receipts_email_outbox_pending
  on public.receipts_email_outbox (created_at)
  where sent_at is null and attempts < 5;

-- Lock down. Only service_role (bypasses RLS) and the SECURITY DEFINER trigger
-- write/read this table. Receipts admins have no business touching the mail queue —
-- they care about receipts, not delivery state.
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

create trigger receipts_enqueue_upload_email
after insert on public.receipts
for each row execute function public.receipts_enqueue_upload_email();
