-- receipts app: admin-only receipt review workflow.
-- Each row is one receipt: a name + uploaded image + status (pending /
-- approved / rejected). Only receipts admins can see, upload, or change
-- status — this is the upstream stage before reimburse bookkeeping.

-- =============================================================================
-- Table
-- =============================================================================

create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  image_path  text not null,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references public.user_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index receipts_created_at on public.receipts (created_at desc);
create index receipts_status     on public.receipts (status);

-- =============================================================================
-- updated_at trigger
-- =============================================================================

create or replace function public.receipts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_receipts_updated_at
before update on public.receipts
for each row execute function public.receipts_set_updated_at();

-- =============================================================================
-- Admin helper: roles.receipts contains "admin"
-- (security definer to avoid recursive RLS on user_profiles)
-- =============================================================================

create or replace function public.is_receipts_admin()
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
        or (up.roles ? 'receipts' and up.roles -> 'receipts' ? 'admin')
      )
  );
$$;

-- =============================================================================
-- RLS — admin-only across the board (table is for the receipts admin's eyes)
-- =============================================================================

alter table public.receipts enable row level security;

create policy "receipts_select"
on public.receipts for select
using (public.is_receipts_admin());

create policy "receipts_insert"
on public.receipts for insert
with check (public.is_receipts_admin());

create policy "receipts_update"
on public.receipts for update
using (public.is_receipts_admin())
with check (public.is_receipts_admin());

create policy "receipts_delete"
on public.receipts for delete
using (public.is_receipts_admin());

-- =============================================================================
-- Storage — private bucket, admin-only read/write
-- Path layout: <receipt_id>/<filename>
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_select"
on storage.objects for select
using (bucket_id = 'receipts' and public.is_receipts_admin());

create policy "receipts_storage_insert"
on storage.objects for insert
with check (bucket_id = 'receipts' and public.is_receipts_admin());

create policy "receipts_storage_update"
on storage.objects for update
using (bucket_id = 'receipts' and public.is_receipts_admin())
with check (bucket_id = 'receipts' and public.is_receipts_admin());

create policy "receipts_storage_delete"
on storage.objects for delete
using (bucket_id = 'receipts' and public.is_receipts_admin());
