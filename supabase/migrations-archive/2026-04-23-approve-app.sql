-- Drop legacy tables from the old approve.winlab.tw
drop table if exists public.document_signers cascade;
drop table if exists public.signature_boxes  cascade;
drop table if exists public.user_signatures  cascade;
drop table if exists public.documents        cascade;

-- Documents
create table public.approve_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  file_path     text,
  status        text not null default 'draft'
                  check (status in ('draft','pending','completed','cancelled')),
  created_by    uuid not null references public.user_profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- updated_at trigger
create or replace function public.approve_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger approve_documents_touch
before update on public.approve_documents
for each row execute function public.approve_touch_updated_at();

-- Signers
create table public.approve_signers (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.approve_documents(id) on delete cascade,
  signer_id     uuid not null references public.user_profiles(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','signed')),
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (document_id, signer_id)
);

-- Fields (placed boxes + eventual values)
create table public.approve_fields (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.approve_documents(id) on delete cascade,
  signer_id     uuid not null references public.user_profiles(id) on delete cascade,
  page          int  not null check (page >= 1),
  x             numeric not null check (x >= 0 and x <= 1),
  y             numeric not null check (y >= 0 and y <= 1),
  width         numeric not null check (width > 0 and width <= 1),
  height        numeric not null check (height > 0 and height <= 1),
  category      text not null
                  check (category in ('signature','contact_address','household_address','id_number','phone','other')),
  label         text,
  value         text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- User pre-filled values (cross-document)
create table public.approve_user_field_values (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profiles(id) on delete cascade,
  category      text not null
                  check (category in ('signature','contact_address','household_address','id_number','phone')),
  value         text not null,
  updated_at    timestamptz not null default now(),
  unique (user_id, category)
);

-- Indexes for hot paths
create index approve_signers_inbox
  on public.approve_signers (signer_id, status)
  where status = 'pending';
create index approve_signers_signed
  on public.approve_signers (signer_id, status, signed_at desc)
  where status = 'signed';
create index approve_documents_created_by
  on public.approve_documents (created_by, created_at desc);
create index approve_fields_document_signer
  on public.approve_fields (document_id, signer_id);

-- Enable RLS
alter table public.approve_documents         enable row level security;
alter table public.approve_signers           enable row level security;
alter table public.approve_fields            enable row level security;
alter table public.approve_user_field_values enable row level security;

-- Policies: approve_documents
create policy "approve_documents_select"
on public.approve_documents for select
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.approve_signers s
    where s.document_id = approve_documents.id and s.signer_id = auth.uid()
  )
);
create policy "approve_documents_insert"
on public.approve_documents for insert
with check (created_by = auth.uid());
create policy "approve_documents_update"
on public.approve_documents for update
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "approve_documents_delete"
on public.approve_documents for delete
using (created_by = auth.uid() and status in ('draft','pending'));

-- Policies: approve_signers
create policy "approve_signers_select"
on public.approve_signers for select
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_signers_insert"
on public.approve_signers for insert
with check (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_signers_update"
on public.approve_signers for update
using (signer_id = auth.uid())
with check (signer_id = auth.uid());
create policy "approve_signers_delete"
on public.approve_signers for delete
using (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id
      and d.created_by = auth.uid()
      and d.status in ('draft','pending')
  )
);

-- Policies: approve_fields
create policy "approve_fields_select"
on public.approve_fields for select
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_fields_insert"
on public.approve_fields for insert
with check (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);
create policy "approve_fields_update"
on public.approve_fields for update
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
)
with check (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);
create policy "approve_fields_delete"
on public.approve_fields for delete
using (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);

-- Policies: approve_user_field_values
create policy "approve_user_field_values_select"
on public.approve_user_field_values for select
using (user_id = auth.uid());
create policy "approve_user_field_values_insert"
on public.approve_user_field_values for insert
with check (user_id = auth.uid());
create policy "approve_user_field_values_update"
on public.approve_user_field_values for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "approve_user_field_values_delete"
on public.approve_user_field_values for delete
using (user_id = auth.uid());
