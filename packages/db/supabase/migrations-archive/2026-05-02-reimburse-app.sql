-- reimburse app: lab cash-flow bookkeeping (migrated from reimburse.winlab.tw).
-- Tracks egress (expenses with optional invoice/transfer-fee) and ingress
-- (income), with admin-managed CRUD and lab-wide read visibility.
--
-- Schema mirrors the legacy `egress` / `ingress` tables but renamed to
-- `reimburse_*` to align with the app namespace. Storage buckets keep their
-- existing names (already prefixed: reimburse-invoices, reimburse-signatures,
-- reimburse-advances). A follow-up migration drops `egress` / `ingress` once
-- portal /reimburse is verified stable.

-- =============================================================================
-- Tables
-- =============================================================================

create table public.reimburse_egress (
  id              uuid primary key default gen_random_uuid(),
  applicant_name  text not null,
  item_name       text not null,
  item_amount     numeric not null check (item_amount >= 0),
  item_comment    text,
  invoice_date    date not null,
  invoice_files   text[] not null default '{}',
  transfer_date   date,
  transfer_fee    numeric check (transfer_fee is null or transfer_fee >= 0),
  transfer_files  text[],
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  user_id         uuid references public.user_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index reimburse_egress_invoice_date
  on public.reimburse_egress (invoice_date desc);
create index reimburse_egress_user_id
  on public.reimburse_egress (user_id);

create table public.reimburse_ingress (
  id              uuid primary key default gen_random_uuid(),
  ingress_date    date not null,
  ingress_amount  numeric not null check (ingress_amount >= 0),
  ingress_comment text,
  ingress_files   text[] not null default '{}',
  user_id         uuid references public.user_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index reimburse_ingress_ingress_date
  on public.reimburse_ingress (ingress_date desc);
create index reimburse_ingress_user_id
  on public.reimburse_ingress (user_id);

-- =============================================================================
-- updated_at trigger (mirrors original reimburse table behavior)
-- =============================================================================

create or replace function public.reimburse_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_reimburse_egress_updated_at
before update on public.reimburse_egress
for each row execute function public.reimburse_set_updated_at();

create trigger trg_reimburse_ingress_updated_at
before update on public.reimburse_ingress
for each row execute function public.reimburse_set_updated_at();

-- =============================================================================
-- Admin helper: roles.reimburse contains "admin"
-- (security definer to avoid recursive RLS evaluation on user_profiles)
-- =============================================================================

create or replace function public.is_reimburse_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'reimburse' and up.roles -> 'reimburse' ? 'admin')
      )
  );
$$;

-- =============================================================================
-- RLS — lab-wide visibility, admin-only writes
-- =============================================================================

alter table public.reimburse_egress  enable row level security;
alter table public.reimburse_ingress enable row level security;

-- Any signed-in user can list (lab-wide bookkeeping is shared knowledge).
create policy "reimburse_egress_select"
on public.reimburse_egress for select
using (auth.uid() is not null);

create policy "reimburse_ingress_select"
on public.reimburse_ingress for select
using (auth.uid() is not null);

-- Only reimburse admins (or global is_admin) may mutate.
create policy "reimburse_egress_insert"
on public.reimburse_egress for insert
with check (public.is_reimburse_admin());

create policy "reimburse_egress_update"
on public.reimburse_egress for update
using (public.is_reimburse_admin())
with check (public.is_reimburse_admin());

create policy "reimburse_egress_delete"
on public.reimburse_egress for delete
using (public.is_reimburse_admin());

create policy "reimburse_ingress_insert"
on public.reimburse_ingress for insert
with check (public.is_reimburse_admin());

create policy "reimburse_ingress_update"
on public.reimburse_ingress for update
using (public.is_reimburse_admin())
with check (public.is_reimburse_admin());

create policy "reimburse_ingress_delete"
on public.reimburse_ingress for delete
using (public.is_reimburse_admin());

-- =============================================================================
-- Data migration: copy existing egress / ingress rows into reimburse_*
-- (preserves IDs so existing storage paths and external references stay valid)
-- =============================================================================

insert into public.reimburse_egress (
  id, applicant_name, item_name, item_amount, item_comment,
  invoice_date, invoice_files, transfer_date, transfer_fee, transfer_files,
  status, user_id, created_at, updated_at
)
select
  id, applicant_name, item_name, item_amount, item_comment,
  invoice_date, coalesce(invoice_files, '{}'),
  transfer_date, transfer_fee, transfer_files,
  status, user_id, created_at, updated_at
from public.egress;

insert into public.reimburse_ingress (
  id, ingress_date, ingress_amount, ingress_comment, ingress_files,
  user_id, created_at, updated_at
)
select
  id, ingress_date, ingress_amount, ingress_comment,
  coalesce(ingress_files, '{}'),
  user_id, created_at, updated_at
from public.ingress;
