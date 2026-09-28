-- receipts app: tags.
-- A reusable tag library plus a many-to-many between tags and receipts.
-- Variant is grayscale-emphasis (default / secondary / outline) to stay
-- inside portal's neutral design system — no hue tokens introduced.

-- =============================================================================
-- Tag library
-- =============================================================================

create table public.receipt_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  variant    text not null default 'secondary'
               check (variant in ('default', 'secondary', 'outline')),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Tag names are case-insensitively unique so "Travel" and "travel"
-- can't both exist and confuse the picker.
create unique index receipt_tags_name_unique
  on public.receipt_tags (lower(name));

-- =============================================================================
-- Many-to-many between receipts and tags
-- =============================================================================

create table public.receipt_tag_assignments (
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  tag_id     uuid not null references public.receipt_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (receipt_id, tag_id)
);

create index receipt_tag_assignments_tag
  on public.receipt_tag_assignments (tag_id);

-- =============================================================================
-- RLS — receipts admins only, same gate as the receipts table
-- =============================================================================

alter table public.receipt_tags enable row level security;
alter table public.receipt_tag_assignments enable row level security;

create policy "receipt_tags_select"
on public.receipt_tags for select
using (public.is_receipts_admin());

create policy "receipt_tags_insert"
on public.receipt_tags for insert
with check (public.is_receipts_admin());

create policy "receipt_tags_update"
on public.receipt_tags for update
using (public.is_receipts_admin())
with check (public.is_receipts_admin());

create policy "receipt_tags_delete"
on public.receipt_tags for delete
using (public.is_receipts_admin());

create policy "receipt_tag_assignments_select"
on public.receipt_tag_assignments for select
using (public.is_receipts_admin());

create policy "receipt_tag_assignments_insert"
on public.receipt_tag_assignments for insert
with check (public.is_receipts_admin());

create policy "receipt_tag_assignments_delete"
on public.receipt_tag_assignments for delete
using (public.is_receipts_admin());
