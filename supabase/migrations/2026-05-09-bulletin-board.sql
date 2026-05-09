-- supabase/migrations/2026-05-09-bulletin-board.sql
-- Bulletin board: announcements with tags visible on the portal home page.
-- All authenticated users can read published announcements.
-- Only portal super-admins (is_admin = true) can create / edit / delete.

-- =============================================================================
-- Table
-- =============================================================================

create table public.announcements (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  content      text        not null,
  tags         text[]      not null default '{}',
  is_published boolean     not null default true,
  pinned       boolean     not null default false,
  created_by   uuid        references public.user_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index announcements_created_at on public.announcements (created_at desc);
create index announcements_pinned on public.announcements (pinned desc, created_at desc);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.announcements enable row level security;

-- All authenticated users can read published announcements
create policy "authenticated users can read published announcements"
  on public.announcements for select
  to authenticated
  using (is_published = true);

-- Only portal super-admins can insert / update / delete
create policy "portal admins can manage announcements"
  on public.announcements for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
