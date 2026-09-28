-- Outbox for approve-app email notifications.
-- Populated by a trigger on approve_documents status transitions.
-- Consumed by a Vercel Cron worker that calls Resend.
--
-- Why outbox instead of firing Resend inside the request?
-- 1. The submitDocument / submit-signature paths stay fast — no waiting on SMTP.
-- 2. Resend / network failure doesn't roll back the status change.
-- 3. Retries are free: consumer re-reads rows whose sent_at is still null.

create table public.approve_email_outbox (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.approve_documents(id) on delete cascade,
  recipient_id uuid not null references public.user_profiles(id) on delete cascade,
  kind         text not null
                 check (kind in ('signer-invited','document-completed')),
  attempts     int  not null default 0,
  last_error   text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Hot path for the consumer: oldest unsent rows that haven't burned through retries.
create index approve_email_outbox_pending
  on public.approve_email_outbox (created_at)
  where sent_at is null and attempts < 5;

-- Lock down. Only service_role (bypasses RLS) and the SECURITY DEFINER trigger
-- write/read this table. End users have no business touching the mail queue.
alter table public.approve_email_outbox enable row level security;

create or replace function public.approve_enqueue_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- draft → pending: tell every signer they have something to sign
  if old.status = 'draft' and new.status = 'pending' then
    insert into public.approve_email_outbox (document_id, recipient_id, kind)
    select new.id, s.signer_id, 'signer-invited'
    from public.approve_signers s
    where s.document_id = new.id;
  end if;

  -- pending → completed: tell the creator that everyone has signed
  if old.status = 'pending' and new.status = 'completed' then
    insert into public.approve_email_outbox (document_id, recipient_id, kind)
    values (new.id, new.created_by, 'document-completed');
  end if;

  return new;
end $$;

create trigger approve_documents_enqueue_emails
after update of status on public.approve_documents
for each row execute function public.approve_enqueue_emails();
