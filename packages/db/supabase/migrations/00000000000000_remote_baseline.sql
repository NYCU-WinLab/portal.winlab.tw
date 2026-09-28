-- =====================================================================
-- portal.winlab.tw — AUTHORITATIVE public-schema DDL baseline
-- =====================================================================
-- Captured: 2026-05-29 from the PRODUCTION database via the supabase MCP
-- (read-only SELECTs against pg_catalog / information_schema only).
--
-- Every statement below was produced by Postgres's own catalog functions
-- (pg_get_functiondef, pg_get_triggerdef, pg_get_viewdef,
-- pg_get_constraintdef, pg_get_indexdef, pg_get_expr, format_type, etc.) —
-- the same functions pg_dump uses internally. Nothing here is hand-written
-- from memory.
--
-- PURPOSE
--   * `supabase db reset` baseline — a fresh empty Postgres + this file
--     should reproduce the prod `public` schema.
--   * RLS / policy testing harness.
--
-- ORDERING (pg_dump-style, dependency-safe):
--   1. extensions
--   2. custom types / enums
--   3. create table (columns + defaults + identity, NO FKs) + primary keys
--   4. sequences (none — all PKs are uuid/text, no serial/identity)
--   5. alter table add constraint (FK / UNIQUE / CHECK)
--   6. indexes
--   7. functions
--   8. triggers
--   9. views
--  10. alter table ... enable row level security
--  11. create policy
--  12. grants
--
-- =====================================================================
-- CROSS-SCHEMA / SUPABASE-LOCAL CAVEATS (read before db reset on bare PG)
-- =====================================================================
-- This schema depends on objects a supabase project provides but a BARE
-- Postgres does NOT. On `supabase db reset` (local supabase stack) these
-- all exist; on a vanilla Postgres they must be stubbed first.
--
--   * Roles `anon`, `authenticated`, `service_role` — created by supabase.
--   * `auth.uid()` — used by nearly every RLS policy and SECURITY DEFINER
--     function (supabase auth helper).
--   * `auth.users` — referenced by many FKs (see section 5) and by
--     functions get_user_email / upsert_user_profile / handle_new_user /
--     portal_admin_get_users.
--   * Schemas `extensions` and `vault` — extension install targets.
--   * `gen_random_uuid()` — provided here by pgcrypto (also in core PG 13+).
--
-- The `handle_new_user()` trigger function exists here but its triggering
-- trigger lives on `auth.users` (NOT a public table) and is therefore NOT
-- part of this public-schema dump. Recreate it separately if needed.
-- =====================================================================


-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================
-- plpgsql, supabase_vault, pg_cron are supabase/core-managed and already
-- present in a fresh supabase db; listed for completeness with IF NOT
-- EXISTS so re-running is safe. On bare Postgres the `extensions`/`vault`
-- schemas must exist first (supabase creates them).

-- Defer function-body validation (pg_dump does the same): SQL functions can
-- reference other functions defined later in this file, so validating bodies
-- at CREATE time would fail on forward references. Bodies are checked at call
-- time instead.
set check_function_bodies = false;

create schema if not exists extensions;

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
-- supabase/core-managed (skip on bare PG if they error):
-- create extension if not exists supabase_vault with schema vault;       -- v0.3.1
-- create extension if not exists pg_cron with schema pg_catalog;          -- v1.6.4
-- plpgsql is installed by default in every database.


-- =====================================================================
-- 2. CUSTOM TYPES / ENUMS
-- =====================================================================
do $$ begin
  create type public.egress_status as enum ('pending', 'approved', 'rejected', 'transferred');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_type as enum ('2048', 'memory', 'typing', 'snake', 'pipes', 'kings', 'queens');
exception when duplicate_object then null; end $$;


-- =====================================================================
-- 3. TABLES (columns + defaults + identity, NO foreign keys) + PRIMARY KEYS
-- =====================================================================
-- NOTE: debit_expenses.creator_id and debt_expenses.creator_id default to
-- auth.uid() — requires the supabase auth schema at runtime.

create table if not exists public.announcements (
    id uuid default gen_random_uuid() not null,
    title text not null,
    content text not null,
    tags text[] default '{}'::text[] not null,
    is_published boolean default true not null,
    pinned boolean default false not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    notified_at timestamp with time zone
);

create table if not exists public.approve_documents (
    id uuid default gen_random_uuid() not null,
    title text not null,
    file_path text,
    status text default 'draft'::text not null,
    created_by uuid not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    completed_at timestamp with time zone
);

create table if not exists public.approve_email_outbox (
    id uuid default gen_random_uuid() not null,
    document_id uuid not null,
    recipient_id uuid not null,
    kind text not null,
    attempts integer default 0 not null,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.approve_fields (
    id uuid default gen_random_uuid() not null,
    document_id uuid not null,
    signer_id uuid,
    page integer not null,
    x numeric not null,
    y numeric not null,
    width numeric not null,
    height numeric not null,
    category text not null,
    label text,
    value text,
    signed_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.approve_signers (
    id uuid default gen_random_uuid() not null,
    document_id uuid not null,
    signer_id uuid not null,
    status text default 'pending'::text not null,
    signed_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.approve_user_field_values (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    category text not null,
    value text not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.bento_mcp_auth_codes (
    code text not null,
    access_token text not null,
    refresh_token text,
    client_id text not null,
    redirect_uri text not null,
    state text,
    code_challenge text not null,
    code_challenge_method text default 'S256'::text not null,
    expires_at timestamp with time zone default (now() + '00:10:00'::interval) not null
);

create table if not exists public.bento_mcp_clients (
    client_id text default (gen_random_uuid())::text not null,
    redirect_uris text[] not null,
    token_endpoint_auth_method text default 'none'::text not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.bento_menu_items (
    id uuid default gen_random_uuid() not null,
    restaurant_id uuid not null,
    name text not null,
    price numeric(10,2) not null,
    created_at timestamp with time zone default now(),
    type text,
    options jsonb
);

create table if not exists public.bento_menus (
    id uuid default gen_random_uuid() not null,
    name text not null,
    phone text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    additional jsonb,
    google_map_link text,
    is_active boolean default true not null
);

create table if not exists public.bento_order_items (
    id uuid default gen_random_uuid() not null,
    order_id text not null,
    menu_item_id uuid not null,
    user_id uuid,
    no_sauce boolean default false,
    created_at timestamp with time zone default now(),
    additional integer,
    anonymous_name text,
    anonymous_contact text
);

create table if not exists public.bento_orders (
    id text not null,
    restaurant_id uuid not null,
    status text default 'active'::text not null,
    closed_at timestamp with time zone,
    auto_close_at timestamp with time zone,
    created_by uuid not null,
    created_at timestamp with time zone default now()
);

create table if not exists public.bento_ratings (
    id uuid default gen_random_uuid() not null,
    menu_item_id uuid not null,
    user_id uuid not null,
    score integer not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.bulletin_message_mentions (
    message_id uuid not null,
    mentioned_user_id uuid not null,
    notified_at timestamp with time zone
);

create table if not exists public.bulletin_messages (
    id uuid default gen_random_uuid() not null,
    content text not null,
    author_id uuid not null,
    is_broadcast boolean default false not null,
    broadcast_notified_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.claims (
    id uuid not null,
    user_id uuid not null,
    title text not null,
    status text default 'draft'::text not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.debit_expense_items (
    id uuid default gen_random_uuid() not null,
    expense_id uuid not null,
    debtor_id uuid not null,
    amount numeric not null,
    created_at timestamp with time zone default now() not null,
    paid_at timestamp with time zone
);

create table if not exists public.debit_expenses (
    id uuid default gen_random_uuid() not null,
    creator_id uuid default auth.uid() not null,
    name text not null,
    description text,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.debit_settlements (
    id uuid default gen_random_uuid() not null,
    period text not null,
    from_user_id uuid not null,
    to_user_id uuid not null,
    amount numeric not null,
    from_confirmed boolean default false not null,
    to_confirmed boolean default false not null,
    settled_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.debt_expense_items (
    id uuid default gen_random_uuid() not null,
    expense_id uuid not null,
    debtor_id uuid not null,
    amount numeric not null,
    paid_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.debt_expenses (
    id uuid default gen_random_uuid() not null,
    creator_id uuid default auth.uid() not null,
    name text not null,
    description text,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.debt_settlements (
    id uuid default gen_random_uuid() not null,
    period text not null,
    from_user_id uuid not null,
    to_user_id uuid not null,
    amount numeric not null,
    from_confirmed boolean default false not null,
    to_confirmed boolean default false not null,
    settled_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.egress (
    id uuid default gen_random_uuid() not null,
    applicant_name text not null,
    item_name text not null,
    item_amount numeric(12,2) not null,
    item_comment text,
    invoice_date date not null,
    invoice_files text[] default '{}'::text[],
    transfer_date date,
    transfer_fee numeric(12,2),
    transfer_files text[] default '{}'::text[],
    status egress_status default 'pending'::egress_status not null,
    user_id uuid,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.gallery_image_votes (
    image_id uuid not null,
    user_id uuid not null,
    created_at timestamp with time zone default now() not null,
    reaction text default 'like'::text not null
);

create table if not exists public.gallery_images (
    id uuid default gen_random_uuid() not null,
    name text not null,
    image_path text not null,
    created_by uuid not null,
    created_at timestamp with time zone default now() not null,
    media_type text default 'image'::text not null,
    poster_path text,
    duration_seconds integer
);

create table if not exists public.game_scores (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    game_type game_type not null,
    score integer not null,
    finish_time_ms integer not null,
    created_at timestamp with time zone default now() not null,
    level smallint
);

create table if not exists public.images (
    id text not null,
    filename text not null,
    mime_type text not null,
    size integer not null,
    storage_path text not null,
    user_id uuid,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.ingress (
    id uuid default gen_random_uuid() not null,
    ingress_date date not null,
    ingress_amount numeric(12,2) not null,
    ingress_comment text,
    ingress_files text[] default '{}'::text[],
    user_id uuid,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.invoice (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    reason text not null,
    notes text default ''::text,
    status text default 'pending'::text not null,
    image_paths text[] default '{}'::text[] not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.items (
    id uuid default gen_random_uuid() not null,
    desktop_id uuid not null,
    user_id uuid not null,
    type text not null,
    title text not null,
    url text,
    icon_url text,
    content text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    sort_order integer default 0
);

create table if not exists public.leaves (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    date date not null,
    reason text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.mcp_oauth_auth_codes (
    code text not null,
    data jsonb not null,
    expires_at timestamp with time zone default (now() + '00:10:00'::interval) not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.mcp_oauth_clients (
    client_id text not null,
    client_name text not null,
    redirect_uris jsonb not null,
    grant_types jsonb not null,
    response_types jsonb not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.meeting_groups (
    group_number integer not null,
    members text[] default '{}'::text[] not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.meetings (
    id uuid default gen_random_uuid() not null,
    year integer not null,
    week_label text,
    scheduled_date date not null,
    is_holiday boolean default false not null,
    presenter text,
    presenter_user_id uuid,
    ppt_uploaded boolean default false not null,
    video_uploaded boolean default false not null,
    paper_title text,
    paper_link text,
    notes text,
    created_at timestamp with time zone default now() not null,
    ppt_link text,
    video_link text,
    location text default 'EC 411'::text not null,
    start_time text default '15:30'::text not null,
    question_group_number integer
);

create table if not exists public.members (
    id uuid default gen_random_uuid() not null,
    name text not null,
    name_en text,
    email text not null,
    phone text,
    role text not null,
    title text,
    avatar_url text,
    github text,
    office text,
    research_areas text[],
    joined_year integer,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    student_id text
);

create table if not exists public.notepads (
    id text not null,
    content text default ''::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.pending_bot_bindings (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    code text not null,
    platform text not null,
    expires_at timestamp with time zone default (now() + '00:10:00'::interval) not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.receipt_tag_assignments (
    receipt_id uuid not null,
    tag_id uuid not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.receipt_tags (
    id uuid default gen_random_uuid() not null,
    name text not null,
    variant text default 'secondary'::text not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.receipts (
    id uuid default gen_random_uuid() not null,
    name text not null,
    image_path text not null,
    status text default 'pending'::text not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.reimburse_egress (
    id uuid default gen_random_uuid() not null,
    applicant_name text not null,
    item_name text not null,
    item_amount numeric not null,
    item_comment text,
    invoice_date date not null,
    invoice_files text[] default '{}'::text[] not null,
    transfer_date date,
    transfer_fee numeric,
    transfer_files text[],
    status text default 'pending'::text not null,
    user_id uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.reimburse_ingress (
    id uuid default gen_random_uuid() not null,
    ingress_date date not null,
    ingress_amount numeric not null,
    ingress_comment text,
    ingress_files text[] default '{}'::text[] not null,
    user_id uuid,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create table if not exists public.teacher_papers (
    id uuid default gen_random_uuid() not null,
    provided_date date not null,
    paper_name text not null,
    file_link text,
    source text,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.trip_files (
    id uuid default gen_random_uuid() not null,
    trip_id uuid not null,
    user_id uuid,
    storage_path text not null,
    filename text not null,
    description text,
    size_bytes bigint,
    created_at timestamp with time zone default now() not null
);

create table if not exists public.trips (
    id uuid default gen_random_uuid() not null,
    name text not null,
    description text,
    status text default 'open'::text not null,
    created_by uuid,
    created_at timestamp with time zone default now() not null,
    closed_at timestamp with time zone
);

create table if not exists public.user_profiles (
    id uuid not null,
    email text,
    name text,
    is_admin boolean default false,
    created_at timestamp with time zone default now(),
    roles jsonb default '{}'::jsonb,
    claude_session_id text,
    last_active_platform text,
    line_user_id text,
    telegram_user_id text,
    discord_user_id text,
    active_workflow jsonb
);

create table if not exists public.user_sign_prefs (
    user_id uuid not null,
    enabled boolean default false not null,
    corner text default 'br'::text not null,
    updated_at timestamp with time zone default now() not null
);


-- ----- PRIMARY KEYS -----
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.approve_documents add constraint approve_documents_pkey PRIMARY KEY (id);
alter table public.approve_email_outbox add constraint approve_email_outbox_pkey PRIMARY KEY (id);
alter table public.approve_fields add constraint approve_fields_pkey PRIMARY KEY (id);
alter table public.approve_signers add constraint approve_signers_pkey PRIMARY KEY (id);
alter table public.approve_user_field_values add constraint approve_user_field_values_pkey PRIMARY KEY (id);
alter table public.bento_mcp_auth_codes add constraint bento_mcp_auth_codes_pkey PRIMARY KEY (code);
alter table public.bento_mcp_clients add constraint bento_mcp_clients_pkey PRIMARY KEY (client_id);
alter table public.bento_menu_items add constraint bento_menu_items_pkey PRIMARY KEY (id);
alter table public.bento_menus add constraint bento_menus_pkey PRIMARY KEY (id);
alter table public.bento_order_items add constraint bento_order_items_pkey PRIMARY KEY (id);
alter table public.bento_orders add constraint bento_orders_new_pkey PRIMARY KEY (id);
alter table public.bento_ratings add constraint bento_ratings_pkey PRIMARY KEY (id);
alter table public.bulletin_message_mentions add constraint bulletin_message_mentions_pkey PRIMARY KEY (message_id, mentioned_user_id);
alter table public.bulletin_messages add constraint bulletin_messages_pkey PRIMARY KEY (id);
alter table public.claims add constraint claims_pkey PRIMARY KEY (id);
alter table public.debit_expense_items add constraint debit_expense_items_pkey PRIMARY KEY (id);
alter table public.debit_expenses add constraint debit_expenses_pkey PRIMARY KEY (id);
alter table public.debit_settlements add constraint debit_settlements_pkey PRIMARY KEY (id);
alter table public.debt_expense_items add constraint debt_expense_items_pkey PRIMARY KEY (id);
alter table public.debt_expenses add constraint debt_expenses_pkey PRIMARY KEY (id);
alter table public.debt_settlements add constraint debt_settlements_pkey PRIMARY KEY (id);
alter table public.egress add constraint egress_pkey PRIMARY KEY (id);
alter table public.gallery_image_votes add constraint gallery_image_votes_pkey PRIMARY KEY (image_id, user_id);
alter table public.gallery_images add constraint gallery_images_pkey PRIMARY KEY (id);
alter table public.game_scores add constraint game_scores_pkey PRIMARY KEY (id);
alter table public.images add constraint images_pkey PRIMARY KEY (id);
alter table public.ingress add constraint ingress_pkey PRIMARY KEY (id);
alter table public.invoice add constraint invoice_pkey PRIMARY KEY (id);
alter table public.items add constraint items_pkey PRIMARY KEY (id);
alter table public.leaves add constraint leaves_pkey PRIMARY KEY (id);
alter table public.mcp_oauth_auth_codes add constraint mcp_oauth_auth_codes_pkey PRIMARY KEY (code);
alter table public.mcp_oauth_clients add constraint mcp_oauth_clients_pkey PRIMARY KEY (client_id);
alter table public.meeting_groups add constraint meeting_groups_pkey PRIMARY KEY (group_number);
alter table public.meetings add constraint meetings_pkey PRIMARY KEY (id);
alter table public.members add constraint members_pkey PRIMARY KEY (id);
alter table public.notepads add constraint notepads_pkey PRIMARY KEY (id);
alter table public.pending_bot_bindings add constraint pending_bot_bindings_pkey PRIMARY KEY (id);
alter table public.receipt_tag_assignments add constraint receipt_tag_assignments_pkey PRIMARY KEY (receipt_id, tag_id);
alter table public.receipt_tags add constraint receipt_tags_pkey PRIMARY KEY (id);
alter table public.receipts add constraint receipts_pkey PRIMARY KEY (id);
alter table public.reimburse_egress add constraint reimburse_egress_pkey PRIMARY KEY (id);
alter table public.reimburse_ingress add constraint reimburse_ingress_pkey PRIMARY KEY (id);
alter table public.teacher_papers add constraint teacher_papers_pkey PRIMARY KEY (id);
alter table public.trip_files add constraint trip_files_pkey PRIMARY KEY (id);
alter table public.trips add constraint trips_pkey PRIMARY KEY (id);
alter table public.user_profiles add constraint user_profiles_pkey PRIMARY KEY (id);
alter table public.user_sign_prefs add constraint user_sign_prefs_pkey PRIMARY KEY (user_id);


-- =====================================================================
-- 4. SEQUENCES
-- =====================================================================
-- None. All primary keys are uuid (gen_random_uuid) or text; no serial /
-- identity columns exist in the public schema.


-- =====================================================================
-- 5. CONSTRAINTS — UNIQUE / CHECK / FOREIGN KEY (after all tables exist)
-- =====================================================================

-- ----- UNIQUE -----
alter table public.approve_signers add constraint approve_signers_document_id_signer_id_key UNIQUE (document_id, signer_id);
alter table public.approve_user_field_values add constraint approve_user_field_values_user_id_category_key UNIQUE (user_id, category);
alter table public.bento_ratings add constraint bento_ratings_menu_item_id_user_id_key UNIQUE (menu_item_id, user_id);
alter table public.debit_settlements add constraint debit_settlements_period_from_user_id_to_user_id_key UNIQUE (period, from_user_id, to_user_id);
alter table public.debt_settlements add constraint debt_settlements_period_from_user_id_to_user_id_key UNIQUE (period, from_user_id, to_user_id);
alter table public.leaves add constraint leaves_user_id_date_unique UNIQUE (user_id, date);
alter table public.members add constraint members_email_key UNIQUE (email);
alter table public.pending_bot_bindings add constraint pending_bot_bindings_code_key UNIQUE (code);
alter table public.user_profiles add constraint user_profiles_discord_user_id_key UNIQUE (discord_user_id);
alter table public.user_profiles add constraint user_profiles_line_user_id_key UNIQUE (line_user_id);
alter table public.user_profiles add constraint user_profiles_telegram_user_id_key UNIQUE (telegram_user_id);

-- ----- CHECK -----
alter table public.approve_documents add constraint approve_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'completed'::text, 'cancelled'::text])));
alter table public.approve_email_outbox add constraint approve_email_outbox_kind_check CHECK ((kind = ANY (ARRAY['signer-invited'::text, 'document-completed'::text])));
alter table public.approve_fields add constraint approve_fields_category_check CHECK ((category = ANY (ARRAY['signature'::text, 'contact_address'::text, 'household_address'::text, 'id_number'::text, 'phone'::text, 'other'::text])));
alter table public.approve_fields add constraint approve_fields_height_check CHECK (((height > (0)::numeric) AND (height <= (1)::numeric)));
alter table public.approve_fields add constraint approve_fields_page_check CHECK ((page >= 1));
alter table public.approve_fields add constraint approve_fields_width_check CHECK (((width > (0)::numeric) AND (width <= (1)::numeric)));
alter table public.approve_fields add constraint approve_fields_x_check CHECK (((x >= (0)::numeric) AND (x <= (1)::numeric)));
alter table public.approve_fields add constraint approve_fields_y_check CHECK (((y >= (0)::numeric) AND (y <= (1)::numeric)));
alter table public.approve_signers add constraint approve_signers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text])));
alter table public.approve_user_field_values add constraint approve_user_field_values_category_check CHECK ((category = ANY (ARRAY['signature'::text, 'contact_address'::text, 'household_address'::text, 'id_number'::text, 'phone'::text])));
alter table public.bento_order_items add constraint chk_user_or_anonymous CHECK (((user_id IS NOT NULL) OR (anonymous_name IS NOT NULL)));
alter table public.bento_orders add constraint bento_orders_new_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
alter table public.bento_ratings add constraint bento_ratings_score_check CHECK (((score >= 1) AND (score <= 5)));
alter table public.bulletin_messages add constraint bulletin_messages_content_check CHECK ((length(content) > 0));
alter table public.debit_expense_items add constraint debit_expense_items_amount_check CHECK ((amount > (0)::numeric));
alter table public.debit_settlements add constraint debit_settlements_amount_check CHECK ((amount > (0)::numeric));
alter table public.debit_settlements add constraint debit_settlements_check CHECK ((from_user_id <> to_user_id));
alter table public.debit_settlements add constraint debit_settlements_period_check CHECK ((period ~ '^\d{4}-\d{2}$'::text));
alter table public.debt_expense_items add constraint debt_expense_items_amount_check CHECK ((amount > (0)::numeric));
alter table public.debt_settlements add constraint debt_settlements_amount_check CHECK ((amount > (0)::numeric));
alter table public.debt_settlements add constraint debt_settlements_check CHECK ((from_user_id <> to_user_id));
alter table public.debt_settlements add constraint debt_settlements_period_check CHECK ((period ~ '^\d{4}-\d{2}$'::text));
alter table public.egress add constraint egress_item_amount_check CHECK ((item_amount >= (0)::numeric));
alter table public.egress add constraint egress_transfer_fee_check CHECK ((transfer_fee >= (0)::numeric));
alter table public.gallery_image_votes add constraint gallery_image_votes_reaction_check CHECK ((reaction = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'sad'::text, 'angry'::text, 'point'::text])));
alter table public.gallery_images add constraint gallery_images_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
alter table public.gallery_images add constraint gallery_images_poster_only_for_video CHECK ((((media_type = 'image'::text) AND (poster_path IS NULL)) OR ((media_type = 'video'::text) AND (poster_path IS NOT NULL))));
alter table public.ingress add constraint ingress_ingress_amount_check CHECK ((ingress_amount >= (0)::numeric));
alter table public.invoice add constraint invoice_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.items add constraint items_type_check CHECK ((type = ANY (ARRAY['link'::text, 'app'::text, 'folder'::text, 'file'::text])));
alter table public.leaves add constraint leaves_date_monday_check CHECK ((EXTRACT(dow FROM date) = (1)::numeric));
alter table public.meeting_groups add constraint meeting_groups_group_number_positive CHECK ((group_number > 0));
alter table public.members add constraint members_role_check CHECK ((role = ANY (ARRAY['professor'::text, 'phd'::text, 'master'::text, 'undergraduate'::text, 'alumni'::text, 'staff'::text, 'pending'::text])));
alter table public.pending_bot_bindings add constraint pending_bot_bindings_platform_check CHECK ((platform = ANY (ARRAY['line'::text, 'telegram'::text, 'discord'::text])));
alter table public.receipt_tags add constraint receipt_tags_variant_check CHECK ((variant = ANY (ARRAY['default'::text, 'secondary'::text, 'outline'::text])));
alter table public.receipts add constraint receipts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.reimburse_egress add constraint reimburse_egress_item_amount_check CHECK ((item_amount >= (0)::numeric));
alter table public.reimburse_egress add constraint reimburse_egress_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.reimburse_egress add constraint reimburse_egress_transfer_fee_check CHECK (((transfer_fee IS NULL) OR (transfer_fee >= (0)::numeric)));
alter table public.reimburse_ingress add constraint reimburse_ingress_ingress_amount_check CHECK ((ingress_amount >= (0)::numeric));
alter table public.trips add constraint trips_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
alter table public.user_profiles add constraint user_profiles_last_active_platform_check CHECK ((last_active_platform = ANY (ARRAY['line'::text, 'telegram'::text, 'discord'::text])));
alter table public.user_sign_prefs add constraint user_sign_prefs_corner_check CHECK ((corner = ANY (ARRAY['tl'::text, 'tr'::text, 'bl'::text, 'br'::text])));

-- ----- FOREIGN KEYS -----
-- NOTE: many FKs reference auth.users(id) — requires the supabase auth schema.
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.approve_documents add constraint approve_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.approve_email_outbox add constraint approve_email_outbox_document_id_fkey FOREIGN KEY (document_id) REFERENCES approve_documents(id) ON DELETE CASCADE;
alter table public.approve_email_outbox add constraint approve_email_outbox_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.approve_fields add constraint approve_fields_document_id_fkey FOREIGN KEY (document_id) REFERENCES approve_documents(id) ON DELETE CASCADE;
alter table public.approve_fields add constraint approve_fields_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.approve_signers add constraint approve_signers_document_id_fkey FOREIGN KEY (document_id) REFERENCES approve_documents(id) ON DELETE CASCADE;
alter table public.approve_signers add constraint approve_signers_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.approve_user_field_values add constraint approve_user_field_values_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.bento_mcp_auth_codes add constraint bento_mcp_auth_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES bento_mcp_clients(client_id);
alter table public.bento_menu_items add constraint bento_menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES bento_menus(id) ON DELETE CASCADE;
alter table public.bento_order_items add constraint bento_order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES bento_menu_items(id) ON DELETE CASCADE;
alter table public.bento_order_items add constraint bento_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES bento_orders(id) ON DELETE CASCADE;
alter table public.bento_order_items add constraint bento_order_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.bento_order_items add constraint bento_order_items_user_profile_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id);
alter table public.bento_orders add constraint bento_orders_created_by_profile_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
alter table public.bento_orders add constraint bento_orders_new_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.bento_orders add constraint bento_orders_new_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES bento_menus(id) ON DELETE CASCADE;
alter table public.bento_ratings add constraint bento_ratings_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES bento_menu_items(id) ON DELETE CASCADE;
alter table public.bento_ratings add constraint bento_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.bento_ratings add constraint bento_ratings_user_profile_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id);
alter table public.bulletin_message_mentions add constraint bulletin_message_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.bulletin_message_mentions add constraint bulletin_message_mentions_message_id_fkey FOREIGN KEY (message_id) REFERENCES bulletin_messages(id) ON DELETE CASCADE;
alter table public.bulletin_messages add constraint bulletin_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.claims add constraint claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.claims add constraint claims_user_profiles_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id);
alter table public.debit_expense_items add constraint debit_expense_items_debtor_id_fkey FOREIGN KEY (debtor_id) REFERENCES user_profiles(id);
alter table public.debit_expense_items add constraint debit_expense_items_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES debit_expenses(id) ON DELETE CASCADE;
alter table public.debit_expenses add constraint debit_expenses_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES user_profiles(id);
alter table public.debit_settlements add constraint debit_settlements_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES user_profiles(id);
alter table public.debit_settlements add constraint debit_settlements_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES user_profiles(id);
alter table public.debt_expense_items add constraint debt_expense_items_debtor_id_fkey FOREIGN KEY (debtor_id) REFERENCES user_profiles(id);
alter table public.debt_expense_items add constraint debt_expense_items_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES debt_expenses(id) ON DELETE CASCADE;
alter table public.debt_expenses add constraint debt_expenses_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES user_profiles(id);
alter table public.debt_settlements add constraint debt_settlements_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES user_profiles(id);
alter table public.debt_settlements add constraint debt_settlements_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES user_profiles(id);
alter table public.egress add constraint egress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.gallery_image_votes add constraint gallery_image_votes_image_id_fkey FOREIGN KEY (image_id) REFERENCES gallery_images(id) ON DELETE CASCADE;
alter table public.gallery_image_votes add constraint gallery_image_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.gallery_images add constraint gallery_images_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.game_scores add constraint game_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.images add constraint images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.ingress add constraint ingress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.invoice add constraint invoice_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.invoice add constraint invoice_user_profile_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id);
alter table public.items add constraint items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.leaves add constraint leaves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.meetings add constraint fk_meeting_question_group FOREIGN KEY (question_group_number) REFERENCES meeting_groups(group_number) ON DELETE SET NULL;
alter table public.meetings add constraint meetings_presenter_user_id_fkey FOREIGN KEY (presenter_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.pending_bot_bindings add constraint pending_bot_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.receipt_tag_assignments add constraint receipt_tag_assignments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE;
alter table public.receipt_tag_assignments add constraint receipt_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES receipt_tags(id) ON DELETE CASCADE;
alter table public.receipt_tags add constraint receipt_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.receipts add constraint receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.reimburse_egress add constraint reimburse_egress_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.reimburse_ingress add constraint reimburse_ingress_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.trip_files add constraint trip_files_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public.trip_files add constraint trip_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.trips add constraint trips_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
alter table public.user_profiles add constraint user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_sign_prefs add constraint user_sign_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;


-- =====================================================================
-- 6. INDEXES (non-constraint)
-- =====================================================================
CREATE INDEX IF NOT EXISTS announcements_created_at ON public.announcements USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_notified_at ON public.announcements USING btree (notified_at) WHERE (is_published = true);
CREATE INDEX IF NOT EXISTS announcements_pinned ON public.announcements USING btree (pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS approve_documents_created_by ON public.approve_documents USING btree (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS approve_email_outbox_pending ON public.approve_email_outbox USING btree (created_at) WHERE ((sent_at IS NULL) AND (attempts < 5));
CREATE INDEX IF NOT EXISTS approve_fields_document_signer ON public.approve_fields USING btree (document_id, signer_id);
CREATE INDEX IF NOT EXISTS approve_signers_inbox ON public.approve_signers USING btree (signer_id, status) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS approve_signers_signed ON public.approve_signers USING btree (signer_id, status, signed_at DESC) WHERE (status = 'signed'::text);
CREATE INDEX IF NOT EXISTS bento_mcp_auth_codes_expires_at_idx ON public.bento_mcp_auth_codes USING btree (expires_at);
CREATE INDEX IF NOT EXISTS bento_menus_is_active_idx ON public.bento_menus USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS bulletin_message_mentions_pending ON public.bulletin_message_mentions USING btree (message_id) WHERE (notified_at IS NULL);
CREATE INDEX IF NOT EXISTS bulletin_messages_broadcast_pending ON public.bulletin_messages USING btree (created_at) WHERE ((is_broadcast = true) AND (broadcast_notified_at IS NULL));
CREATE INDEX IF NOT EXISTS bulletin_messages_created_at ON public.bulletin_messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS debt_expense_items_debtor ON public.debt_expense_items USING btree (debtor_id);
CREATE INDEX IF NOT EXISTS debt_expense_items_expense ON public.debt_expense_items USING btree (expense_id);
CREATE INDEX IF NOT EXISTS debt_expenses_creator_created ON public.debt_expenses USING btree (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debt_settlements_users ON public.debt_settlements USING btree (from_user_id, to_user_id, period);
CREATE INDEX IF NOT EXISTS gallery_image_votes_image_created_at ON public.gallery_image_votes USING btree (image_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_image_votes_user_created_at ON public.gallery_image_votes USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_images_created_at ON public.gallery_images USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_images_created_by ON public.gallery_images USING btree (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS game_scores_by_game ON public.game_scores USING btree (game_type, score DESC, finish_time_ms);
CREATE INDEX IF NOT EXISTS game_scores_by_user ON public.game_scores USING btree (user_id, game_type);
CREATE INDEX IF NOT EXISTS game_scores_game_level_score_idx ON public.game_scores USING btree (game_type, level, score DESC, finish_time_ms);
CREATE INDEX IF NOT EXISTS idx_bento_menu_items_restaurant_id ON public.bento_menu_items USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bento_menu_items_type ON public.bento_menu_items USING btree (type) WHERE (type IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bento_order_items_menu_item_id ON public.bento_order_items USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_bento_order_items_order_id ON public.bento_order_items USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_bento_order_items_user_id ON public.bento_order_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bento_orders_created_by ON public.bento_orders USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_bento_orders_restaurant_id ON public.bento_orders USING btree (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bento_orders_status ON public.bento_orders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_bento_ratings_menu_item_id ON public.bento_ratings USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_bento_ratings_user_id ON public.bento_ratings USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_egress_created_at ON public.egress USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_egress_invoice_date ON public.egress USING btree (invoice_date);
CREATE INDEX IF NOT EXISTS idx_egress_status ON public.egress USING btree (status);
CREATE INDEX IF NOT EXISTS idx_egress_user_id ON public.egress USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ingress_created_at ON public.ingress USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingress_date ON public.ingress USING btree (ingress_date);
CREATE INDEX IF NOT EXISTS idx_ingress_user_id ON public.ingress USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_roles ON public.user_profiles USING gin (roles);
CREATE INDEX IF NOT EXISTS images_created_at_idx ON public.images USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS images_user_id_idx ON public.images USING btree (user_id);
CREATE INDEX IF NOT EXISTS invoice_user_created_idx ON public.invoice USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS items_desktop_id_idx ON public.items USING btree (desktop_id);
CREATE INDEX IF NOT EXISTS items_user_id_idx ON public.items USING btree (user_id);
CREATE INDEX IF NOT EXISTS items_user_sort_idx ON public.items USING btree (user_id, sort_order);
CREATE INDEX IF NOT EXISTS leaves_date_idx ON public.leaves USING btree (date);
CREATE INDEX IF NOT EXISTS leaves_user_id_idx ON public.leaves USING btree (user_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_auth_codes_expires_at_idx ON public.mcp_oauth_auth_codes USING btree (expires_at);
CREATE INDEX IF NOT EXISTS meetings_presenter ON public.meetings USING btree (presenter_user_id);
CREATE INDEX IF NOT EXISTS meetings_year_date ON public.meetings USING btree (year, scheduled_date);
CREATE INDEX IF NOT EXISTS pending_bot_bindings_code_idx ON public.pending_bot_bindings USING btree (code);
CREATE INDEX IF NOT EXISTS pending_bot_bindings_expires_idx ON public.pending_bot_bindings USING btree (expires_at);
CREATE INDEX IF NOT EXISTS receipt_tag_assignments_tag ON public.receipt_tag_assignments USING btree (tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_tags_name_unique ON public.receipt_tags USING btree (lower(name));
CREATE INDEX IF NOT EXISTS receipts_created_at ON public.receipts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_status ON public.receipts USING btree (status);
CREATE INDEX IF NOT EXISTS reimburse_egress_invoice_date ON public.reimburse_egress USING btree (invoice_date DESC);
CREATE INDEX IF NOT EXISTS reimburse_egress_user_id ON public.reimburse_egress USING btree (user_id);
CREATE INDEX IF NOT EXISTS reimburse_ingress_ingress_date ON public.reimburse_ingress USING btree (ingress_date DESC);
CREATE INDEX IF NOT EXISTS reimburse_ingress_user_id ON public.reimburse_ingress USING btree (user_id);
CREATE INDEX IF NOT EXISTS teacher_papers_date ON public.teacher_papers USING btree (provided_date DESC);
CREATE INDEX IF NOT EXISTS trip_files_trip_user ON public.trip_files USING btree (trip_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trip_files_user_created ON public.trip_files USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trips_status_created ON public.trips USING btree (status, created_at DESC);


-- =====================================================================
-- 7. FUNCTIONS
-- =====================================================================
-- SECURITY NOTE: most functions are SECURITY DEFINER. The role-escalation
-- guard is prevent_role_escalation() (trigger fn, see section 8). It is
-- bypassed only when the GUC my.portal_admin_bypass = 'true', which is set
-- transiently inside portal_admin_update_user() — the one sanctioned path
-- to mutate user_profiles.roles / is_admin.
--
-- ORPHAN FUNCTIONS (reference tables that DO NOT exist in this schema):
--   can_sign_document / can_view_document_signers / can_view_signature_boxes
--   reference `document_signers` and `documents` (legacy, dropped tables).
--   They are plpgsql so the body is not validated at CREATE time; they will
--   create fine but FAIL if ever called. Preserved verbatim for fidelity.

CREATE OR REPLACE FUNCTION public.approve_doc_status(doc_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select status from public.approve_documents where id = doc_id
$function$
;

CREATE OR REPLACE FUNCTION public.approve_enqueue_emails()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'draft' and new.status = 'pending' then
    insert into public.approve_email_outbox (document_id, recipient_id, kind)
    select new.id, s.signer_id, 'signer-invited'
    from public.approve_signers s
    where s.document_id = new.id;
  end if;

  if old.status = 'pending' and new.status = 'completed' then
    insert into public.approve_email_outbox (document_id, recipient_id, kind)
    values (new.id, new.created_by, 'document-completed');
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.approve_is_creator(doc_id uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.approve_documents where id = doc_id and created_by = uid
  )
$function$
;

CREATE OR REPLACE FUNCTION public.approve_is_signer(doc_id uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.approve_signers where document_id = doc_id and signer_id = uid
  )
$function$
;

CREATE OR REPLACE FUNCTION public.approve_profile_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'created_count', (
      select count(*)::int
      from public.approve_documents
      where created_by = p_user_id
        and auth.uid() = p_user_id
    ),
    'signed_count', (
      select count(*)::int
      from public.approve_signers
      where signer_id = p_user_id
        and status = 'signed'
        and auth.uid() = p_user_id
    ),
    'avg_sign_delay_seconds', (
      select coalesce(
        extract(epoch from avg(signed_at - created_at))::bigint,
        0
      )
      from public.approve_signers
      where signer_id = p_user_id
        and status = 'signed'
        and signed_at is not null
        and auth.uid() = p_user_id
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.approve_submit_signature(p_document_id uuid, p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_my_id uuid;
  v_my_status text;
  v_pending_count int;
  v_now timestamptz := now();
  v_field record;
  v_val text;
begin
  if v_uid is null then
    raise exception 'Unauthenticated';
  end if;

  select id, status into v_my_id, v_my_status
  from public.approve_signers
  where document_id = p_document_id and signer_id = v_uid;

  if v_my_id is null then
    raise exception 'you are not a signer';
  end if;
  if v_my_status = 'signed' then
    raise exception 'already signed';
  end if;

  for v_field in
    select id, category
    from public.approve_fields
    where document_id = p_document_id and signer_id = v_uid
  loop
    v_val := (select v->>'value' from jsonb_array_elements(p_values) v
              where (v->>'fieldId')::uuid = v_field.id);
    if v_val is null or length(btrim(v_val)) = 0 then
      raise exception 'all fields must be filled';
    end if;
  end loop;

  for v_field in
    select id from public.approve_fields
    where document_id = p_document_id and signer_id = v_uid
  loop
    v_val := (select v->>'value' from jsonb_array_elements(p_values) v
              where (v->>'fieldId')::uuid = v_field.id);
    update public.approve_fields
      set value = v_val, signed_at = v_now
      where id = v_field.id;
  end loop;

  insert into public.approve_user_field_values (user_id, category, value, updated_at)
  select v_uid, f.category,
         (select v->>'value' from jsonb_array_elements(p_values) v
          where (v->>'fieldId')::uuid = f.id),
         v_now
  from public.approve_fields f
  where f.document_id = p_document_id
    and f.signer_id = v_uid
    and f.category <> 'other'
  on conflict (user_id, category) do update
    set value = excluded.value, updated_at = excluded.updated_at;

  update public.approve_signers
    set status = 'signed', signed_at = v_now
    where id = v_my_id;

  select count(*) into v_pending_count
  from public.approve_signers
  where document_id = p_document_id and status = 'pending';

  if v_pending_count = 0 then
    update public.approve_documents
      set status = 'completed', completed_at = v_now
      where id = p_document_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.bento_profile_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select
      mi.id            as menu_item_id,
      mi.name          as menu_item_name,
      r.name           as restaurant_name,
      mi.price         as price
    from public.bento_order_items oi
    join public.bento_menu_items mi on mi.id = oi.menu_item_id
    join public.bento_menus       r  on r.id  = mi.restaurant_id
    where oi.user_id = p_user_id
      and auth.uid() = p_user_id
  ),
  totals as (
    select
      count(*)::int                      as total_orders,
      coalesce(sum(price), 0)::int       as total_spent,
      count(distinct menu_item_id)::int  as unique_items
    from mine
  ),
  top_pick as (
    select menu_item_name, restaurant_name, count(*)::int as cnt
    from mine
    group by menu_item_name, restaurant_name
    order by cnt desc, menu_item_name asc
    limit 1
  )
  select jsonb_build_object(
    'total_orders', (select total_orders from totals),
    'total_spent',  (select total_spent  from totals),
    'unique_items', (select unique_items from totals),
    'top_item', (
      select jsonb_build_object(
        'name',            menu_item_name,
        'restaurant_name', restaurant_name,
        'count',           cnt
      )
      from top_pick
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_sign_document(doc_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM document_signers
    WHERE document_id = doc_id
    AND signer_id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_document_signers(doc_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if user is a signer OR creator of the document
  RETURN EXISTS (
    SELECT 1 FROM document_signers
    WHERE document_id = doc_id AND signer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM documents
    WHERE id = doc_id AND created_by = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_signature_boxes(doc_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if user is a signer OR creator of the document
  RETURN EXISTS (
    SELECT 1 FROM document_signers
    WHERE document_id = doc_id AND signer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM documents
    WHERE id = doc_id AND created_by = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_debtor_not_creator()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.debtor_id = (SELECT creator_id FROM debit_expenses WHERE id = NEW.expense_id) THEN
    RAISE EXCEPTION 'debtor cannot be the same as expense creator';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_settlement_from(p_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE debit_settlements
  SET
    from_confirmed = true,
    settled_at = CASE
      WHEN to_confirmed = true THEN now()
      ELSE settled_at
    END
  WHERE id = p_settlement_id AND from_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found or not authorized';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_settlement_to(p_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE debit_settlements
  SET
    to_confirmed = true,
    settled_at = CASE
      WHEN from_confirmed = true THEN now()
      ELSE settled_at
    END
  WHERE id = p_settlement_id AND to_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found or not authorized';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_bento_order(p_restaurant_id uuid, p_order_date date, p_auto_close_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bento_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id TEXT;
  v_order bento_orders;
BEGIN
  -- Check admin
  IF NOT has_role(auth.uid(), 'bento', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;

  -- Reject disabled restaurants
  IF NOT EXISTS (
    SELECT 1 FROM public.bento_menus
    WHERE id = p_restaurant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION '店家已停用，無法建立訂單' USING ERRCODE = 'P0001';
  END IF;

  -- Generate date-based ID
  v_order_id := TO_CHAR(p_order_date, 'YYYYMMDD');

  -- Check duplicate
  IF EXISTS (SELECT 1 FROM bento_orders WHERE id = v_order_id) THEN
    RAISE EXCEPTION '日期 % 已經有訂單了，請使用現有的訂單', v_order_id;
  END IF;

  -- Insert
  INSERT INTO bento_orders (id, restaurant_id, status, created_by, auto_close_at)
  VALUES (v_order_id, p_restaurant_id, 'active', auth.uid(), p_auto_close_at)
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_expense(p_name text, p_description text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_expense_id uuid;
  v_item jsonb;
BEGIN
  INSERT INTO debit_expenses (creator_id, name, description)
  VALUES (auth.uid(), p_name, p_description)
  RETURNING id INTO v_expense_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO debit_expense_items (expense_id, debtor_id, amount)
    VALUES (
      v_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  END LOOP;

  RETURN v_expense_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_check_debtor_not_creator()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.debtor_id = (select creator_id from public.debt_expenses where id = new.expense_id) then
    raise exception 'debtor cannot be the same as expense creator';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_confirm_settlement_from(p_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.debt_settlements
  set
    from_confirmed = true,
    settled_at = case when to_confirmed = true then now() else settled_at end
  where id = p_settlement_id and from_user_id = auth.uid();

  if not found then
    raise exception 'settlement not found or not authorized';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_confirm_settlement_to(p_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.debt_settlements
  set
    to_confirmed = true,
    settled_at = case when from_confirmed = true then now() else settled_at end
  where id = p_settlement_id and to_user_id = auth.uid();

  if not found then
    raise exception 'settlement not found or not authorized';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_create_expense(p_name text, p_description text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_expense_id uuid;
  v_item jsonb;
begin
  insert into public.debt_expenses (creator_id, name, description)
  values (auth.uid(), p_name, p_description)
  returning id into v_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.debt_expense_items (expense_id, debtor_id, amount)
    values (
      v_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  end loop;

  return v_expense_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_generate_monthly_settlements()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period text;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  v_period       := to_char(now() - interval '1 month', 'YYYY-MM');
  v_period_start := date_trunc('month', now() - interval '1 month');
  v_period_end   := date_trunc('month', now());

  insert into public.debt_settlements (period, from_user_id, to_user_id, amount)
  select v_period, from_user, to_user, net_amount
  from (
    select
      case when net_a_to_b > 0 then user_b else user_a end as from_user,
      case when net_a_to_b > 0 then user_a else user_b end as to_user,
      abs(net_a_to_b) as net_amount
    from (
      select
        least(e.creator_id, ei.debtor_id) as user_a,
        greatest(e.creator_id, ei.debtor_id) as user_b,
        sum(
          case
            when e.creator_id = least(e.creator_id, ei.debtor_id) then ei.amount
            else -ei.amount
          end
        ) as net_a_to_b
      from public.debt_expense_items ei
      join public.debt_expenses e on e.id = ei.expense_id
      where e.created_at >= v_period_start
        and e.created_at <  v_period_end
      group by least(e.creator_id, ei.debtor_id), greatest(e.creator_id, ei.debtor_id)
    ) paired
    where net_a_to_b <> 0
  ) settlements
  on conflict (period, from_user_id, to_user_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_mark_item_paid(p_item_id uuid, p_paid boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.debt_expense_items ei
  set paid_at = case when p_paid then now() else null end
  from public.debt_expenses e
  where ei.id = p_item_id
    and ei.expense_id = e.id
    and e.creator_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.debt_update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
begin
  if not exists (select 1 from public.debt_expenses where id = p_expense_id and creator_id = auth.uid()) then
    raise exception 'expense not found or not authorized';
  end if;

  update public.debt_expenses set name = p_name, description = p_description where id = p_expense_id;

  delete from public.debt_expense_items where expense_id = p_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.debt_expense_items (expense_id, debtor_id, amount)
    values (
      p_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_monthly_settlements()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_period text;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  v_period := to_char(now() - interval '1 month', 'YYYY-MM');
  v_period_start := date_trunc('month', now() - interval '1 month');
  v_period_end := date_trunc('month', now());

  INSERT INTO debit_settlements (period, from_user_id, to_user_id, amount)
  SELECT v_period, from_user, to_user, net_amount
  FROM (
    SELECT
      CASE WHEN net_a_to_b > 0 THEN user_b ELSE user_a END AS from_user,
      CASE WHEN net_a_to_b > 0 THEN user_a ELSE user_b END AS to_user,
      ABS(net_a_to_b) AS net_amount
    FROM (
      SELECT
        LEAST(e.creator_id, ei.debtor_id) AS user_a,
        GREATEST(e.creator_id, ei.debtor_id) AS user_b,
        SUM(
          CASE
            WHEN e.creator_id = LEAST(e.creator_id, ei.debtor_id) THEN ei.amount
            ELSE -ei.amount
          END
        ) AS net_a_to_b
      FROM debit_expense_items ei
      JOIN debit_expenses e ON e.id = ei.expense_id
      WHERE e.created_at >= v_period_start
        AND e.created_at < v_period_end
      GROUP BY LEAST(e.creator_id, ei.debtor_id), GREATEST(e.creator_id, ei.debtor_id)
    ) paired
    WHERE net_a_to_b != 0
  ) settlements
  ON CONFLICT (period, from_user_id, to_user_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_short_id(length integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * 62 + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_game_leaderboard(p_game_type game_type, p_level smallint DEFAULT NULL::smallint)
 RETURNS TABLE(user_id uuid, user_name text, score integer, finish_time_ms integer, achieved_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select user_id, user_name, score, finish_time_ms, achieved_at
  from (
    select distinct on (gs.user_id)
      gs.user_id,
      coalesce(up.name, 'Anonymous')::text as user_name,
      gs.score,
      gs.finish_time_ms,
      gs.created_at as achieved_at
    from public.game_scores gs
    left join public.user_profiles up on gs.user_id = up.id
    where gs.game_type = p_game_type
      and (p_level is null or gs.level = p_level)
    order by gs.user_id, gs.score desc, gs.finish_time_ms asc
  ) best
  order by score desc, finish_time_ms asc
  limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.get_profile_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() = p_user_id then jsonb_build_object(
      'bento',   public.bento_profile_stats(p_user_id),
      'leave',   public.leave_profile_stats(p_user_id),
      'approve', public.approve_profile_stats(p_user_id),
      'trip',    public.trip_profile_stats(p_user_id)
    )
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_email()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();
  RETURN user_email;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_any_role_in_system(user_id_param uuid, system_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_roles JSONB;
BEGIN
  SELECT roles INTO user_roles
  FROM public.user_profiles
  WHERE id = user_id_param;

  IF user_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN user_roles ? system_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(user_id_param uuid, system_name text, role_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_roles JSONB;
BEGIN
  SELECT roles INTO user_roles
  FROM public.user_profiles
  WHERE id = user_id_param;

  IF user_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if the role exists in the system's role array
  RETURN (
    user_roles ? system_name AND
    (user_roles->system_name)::jsonb ? role_name
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_debt_expense_debtor(expense_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.debt_expense_items
    where expense_id = expense_uuid and debtor_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_expense_debtor(expense_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM debit_expense_items
    WHERE expense_id = expense_uuid AND debtor_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_meetings_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'meetings' and up.roles -> 'meetings' ? 'admin')
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_portal_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_receipts_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'receipts' and up.roles -> 'receipts' ? 'admin')
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_reimburse_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'reimburse' and up.roles -> 'reimburse' ? 'admin')
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_trip_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.roles ? 'trip'
      and up.roles -> 'trip' ? 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.leave_profile_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select date
    from public.leaves
    where user_id = p_user_id
      and auth.uid() = p_user_id
  )
  select jsonb_build_object(
    'total_days', (select count(*)::int from mine),
    'first_date', (select min(date) from mine)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.mark_item_paid(p_item_id uuid, p_paid boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE debit_expense_items ei
  SET paid_at = CASE WHEN p_paid THEN now() ELSE NULL END
  FROM debit_expenses e
  WHERE ei.id = p_item_id
    AND ei.expense_id = e.id
    AND e.creator_id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mcp_create_oauth_auth_code(p_code text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.mcp_oauth_auth_codes (code, data)
  values (p_code, p_data);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mcp_exchange_oauth_auth_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_data jsonb;
begin
  delete from public.mcp_oauth_auth_codes
  where code = p_code
    and expires_at >= now()
  returning data into v_data;

  if v_data is not null then
    return v_data;
  end if;

  delete from public.mcp_oauth_auth_codes where code = p_code;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_admin_get_users()
 RETURNS TABLE(id uuid, name text, email text, is_admin boolean, roles jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_portal_admin() then
    raise exception 'permission denied';
  end if;

  return query
  select
    up.id,
    up.name,
    au.email::text,
    coalesce(up.is_admin, false),
    coalesce(up.roles, '{}'::jsonb)
  from public.user_profiles up
  join auth.users au on au.id = up.id
  order by up.name nulls last;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_admin_update_user(p_target_id uuid, p_roles jsonb, p_is_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_target_id = auth.uid() AND NOT p_is_admin THEN
    RAISE EXCEPTION 'cannot remove your own super admin status';
  END IF;

  PERFORM set_config('my.portal_admin_bypass', 'true', true);

  UPDATE public.user_profiles
  SET
    roles    = p_roles,
    is_admin = p_is_admin
  WHERE id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  PERFORM set_config('my.portal_admin_bypass', 'false', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_egress_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Direct modification of reimbursement status is not allowed';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF current_setting('my.portal_admin_bypass', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    RAISE EXCEPTION 'Direct modification of roles is not allowed';
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Direct modification of is_admin is not allowed';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receipts_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reimburse_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_game_score(p_game_type game_type, p_score integer, p_finish_ms integer, p_level smallint DEFAULT NULL::smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_finish_ms < 1 or p_finish_ms > 30 * 60 * 1000 then
    raise exception 'finish_time_ms out of range (1..1800000)';
  end if;

  case p_game_type
    when '2048' then
      if p_score not in (
        2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
        4096, 8192, 16384, 32768, 65536, 131072
      ) then
        raise exception 'invalid 2048 score: %', p_score;
      end if;
      if p_level is not null then
        raise exception '2048 does not use levels';
      end if;

    when 'memory' then
      if p_score <> 8 then
        raise exception 'memory score must be 8';
      end if;
      if p_level is not null then
        raise exception 'memory does not use levels';
      end if;

    when 'typing' then
      if p_score < 0 or p_score > 3000 then
        raise exception 'invalid typing score: %', p_score;
      end if;
      if p_level is null or p_level < 0 or p_level > 5 then
        raise exception 'typing requires level 0..5';
      end if;

    when 'snake' then
      if p_score < 0 or p_score > 397 then
        raise exception 'invalid snake score: %', p_score;
      end if;
      if p_level is not null then
        raise exception 'snake does not use levels';
      end if;

    when 'pipes' then
      if p_score < 0 or p_score > 100 then
        raise exception 'invalid pipes score: %', p_score;
      end if;
      if p_level is null or p_level < 1 or p_level > 100 then
        raise exception 'pipes requires level 1..100';
      end if;

    when 'queens' then
      if p_level is null or p_level < 1 or p_level > 100 then
        raise exception 'queens requires level 1..100';
      end if;
      if p_level between 1 and 30 and p_score <> 5 then
        raise exception 'queens level 1..30 score must be 5';
      elsif p_level between 31 and 60 and p_score <> 6 then
        raise exception 'queens level 31..60 score must be 6';
      elsif p_level between 61 and 100 and p_score <> 7 then
        raise exception 'queens level 61..100 score must be 7';
      end if;

    when 'kings' then
      raise exception 'kings game type is deprecated';
  end case;

  if exists (
    select 1 from game_scores
    where user_id = v_uid
      and game_type = p_game_type
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'rate limited';
  end if;

  insert into game_scores (user_id, game_type, score, finish_time_ms, level)
  values (v_uid, p_game_type, p_score, p_finish_ms, p_level);
end $function$
;

CREATE OR REPLACE FUNCTION public.trip_admin_get_member_signatures(p_trip_id uuid)
 RETURNS TABLE(member_id uuid, signature text, enabled boolean, corner text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    afv.user_id                  as member_id,
    afv.value                    as signature,
    coalesce(p.enabled, false)   as enabled,
    coalesce(p.corner, 'br')     as corner
  from public.approve_user_field_values afv
  left join public.user_sign_prefs p on p.user_id = afv.user_id
  where afv.category = 'signature'
    and afv.user_id in (
      select distinct tf.user_id
      from public.trip_files tf
      where tf.trip_id = p_trip_id
        and tf.user_id is not null
    )
    and public.is_trip_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.trip_profile_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'trips_joined', (
      select count(distinct trip_id)::int
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    ),
    'files_uploaded', (
      select count(*)::int
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    ),
    'total_size_bytes', (
      select coalesce(sum(size_bytes), 0)::bigint
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.update_expense(p_expense_id uuid, p_name text, p_description text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM debit_expenses WHERE id = p_expense_id AND creator_id = auth.uid()) THEN
    RAISE EXCEPTION 'expense not found or not authorized';
  END IF;

  UPDATE debit_expenses SET name = p_name, description = p_description WHERE id = p_expense_id;

  DELETE FROM debit_expense_items WHERE expense_id = p_expense_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO debit_expense_items (expense_id, debtor_id, amount)
    VALUES (
      p_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_invoices_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_members_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_user_profile(p_email text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find user by email in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  -- If user exists, upsert user_profiles
  IF v_user_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, name, is_admin, created_at)
    VALUES (v_user_id, p_email, p_name, FALSE, NOW())
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = EXCLUDED.name;

    RETURN v_user_id;
  END IF;

  RETURN NULL;
END;
$function$
;


-- =====================================================================
-- 8. TRIGGERS (non-internal, on public tables)
-- =====================================================================
-- NB: the auth.users -> handle_new_user() trigger is NOT here (it lives on
-- the auth schema, not public). Recreate separately if your reset needs it.
CREATE TRIGGER approve_documents_enqueue_emails AFTER UPDATE OF status ON approve_documents FOR EACH ROW EXECUTE FUNCTION approve_enqueue_emails();
CREATE TRIGGER approve_documents_touch BEFORE UPDATE ON approve_documents FOR EACH ROW EXECUTE FUNCTION approve_touch_updated_at();
CREATE TRIGGER update_bento_menus_updated_at BEFORE UPDATE ON bento_menus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bento_ratings_updated_at BEFORE UPDATE ON bento_ratings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_check_debtor_not_creator BEFORE INSERT OR UPDATE ON debit_expense_items FOR EACH ROW EXECUTE FUNCTION check_debtor_not_creator();
CREATE TRIGGER trg_debt_check_debtor_not_creator BEFORE INSERT OR UPDATE ON debt_expense_items FOR EACH ROW EXECUTE FUNCTION debt_check_debtor_not_creator();
CREATE TRIGGER trg_prevent_egress_status_change BEFORE UPDATE ON egress FOR EACH ROW EXECUTE FUNCTION prevent_egress_status_change();
CREATE TRIGGER update_egress_updated_at BEFORE UPDATE ON egress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ingress_updated_at BEFORE UPDATE ON ingress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leaves_updated_at BEFORE UPDATE ON leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER members_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_members_updated_at();
CREATE TRIGGER trg_receipts_updated_at BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION receipts_set_updated_at();
CREATE TRIGGER trg_reimburse_egress_updated_at BEFORE UPDATE ON reimburse_egress FOR EACH ROW EXECUTE FUNCTION reimburse_set_updated_at();
CREATE TRIGGER trg_reimburse_ingress_updated_at BEFORE UPDATE ON reimburse_ingress FOR EACH ROW EXECUTE FUNCTION reimburse_set_updated_at();
CREATE TRIGGER trg_prevent_role_escalation BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();


-- =====================================================================
-- 9. VIEWS
-- =====================================================================
-- SECURITY-CRITICAL: neither view sets security_invoker (reloptions IS NULL
-- in prod). They therefore run with the VIEW OWNER's privileges
-- (Postgres default = effectively SECURITY DEFINER). bento_user_rankings
-- and bento_order_stats expose aggregates over bento_order_items /
-- user_profiles and BYPASS the underlying tables' RLS for any role granted
-- SELECT on the view. This matches prod; do NOT silently flip to
-- security_invoker during a reset, or RLS-test results will diverge.

create or replace view public.bento_order_stats as
 SELECT o.id AS order_id,
    count(DISTINCT oi.user_id) AS user_count,
    count(oi.id) AS total_items,
    COALESCE(sum(mi.price), 0::numeric) AS total_price
   FROM bento_orders o
     LEFT JOIN bento_order_items oi ON oi.order_id = o.id
     LEFT JOIN bento_menu_items mi ON mi.id = oi.menu_item_id
  GROUP BY o.id;

create or replace view public.bento_user_rankings as
 SELECT oi.user_id,
    up.name AS user_name,
    count(oi.id) AS order_count,
    COALESCE(sum(mi.price), 0::numeric) AS total_spending,
    count(DISTINCT mi.id) AS unique_items
   FROM bento_order_items oi
     JOIN bento_menu_items mi ON mi.id = oi.menu_item_id
     JOIN user_profiles up ON up.id = oi.user_id
  WHERE oi.user_id IS NOT NULL
  GROUP BY oi.user_id, up.name;


-- =====================================================================
-- 10. ENABLE ROW LEVEL SECURITY (all 48 public tables)
-- =====================================================================
alter table public.announcements enable row level security;
alter table public.approve_documents enable row level security;
alter table public.approve_email_outbox enable row level security;
alter table public.approve_fields enable row level security;
alter table public.approve_signers enable row level security;
alter table public.approve_user_field_values enable row level security;
alter table public.bento_mcp_auth_codes enable row level security;
alter table public.bento_mcp_clients enable row level security;
alter table public.bento_menu_items enable row level security;
alter table public.bento_menus enable row level security;
alter table public.bento_order_items enable row level security;
alter table public.bento_orders enable row level security;
alter table public.bento_ratings enable row level security;
alter table public.bulletin_message_mentions enable row level security;
alter table public.bulletin_messages enable row level security;
alter table public.claims enable row level security;
alter table public.debit_expense_items enable row level security;
alter table public.debit_expenses enable row level security;
alter table public.debit_settlements enable row level security;
alter table public.debt_expense_items enable row level security;
alter table public.debt_expenses enable row level security;
alter table public.debt_settlements enable row level security;
alter table public.egress enable row level security;
alter table public.gallery_image_votes enable row level security;
alter table public.gallery_images enable row level security;
alter table public.game_scores enable row level security;
alter table public.images enable row level security;
alter table public.ingress enable row level security;
alter table public.invoice enable row level security;
alter table public.items enable row level security;
alter table public.leaves enable row level security;
alter table public.mcp_oauth_auth_codes enable row level security;
alter table public.mcp_oauth_clients enable row level security;
alter table public.meeting_groups enable row level security;
alter table public.meetings enable row level security;
alter table public.members enable row level security;
alter table public.notepads enable row level security;
alter table public.pending_bot_bindings enable row level security;
alter table public.receipt_tag_assignments enable row level security;
alter table public.receipt_tags enable row level security;
alter table public.receipts enable row level security;
alter table public.reimburse_egress enable row level security;
alter table public.reimburse_ingress enable row level security;
alter table public.teacher_papers enable row level security;
alter table public.trip_files enable row level security;
alter table public.trips enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_sign_prefs enable row level security;
-- TABLES WITH RLS ENABLED BUT ZERO POLICIES (intentional deny-all to
-- anon/authenticated; only service_role / SECURITY DEFINER fns reach them):
--   approve_email_outbox, bento_mcp_auth_codes, bento_mcp_clients,
--   debit_expense_items? (has policies), mcp_oauth_auth_codes,
--   pending_bot_bindings.
-- (See section 11 — these names simply do not appear there.)


-- =====================================================================
-- 11. POLICIES (149)
-- =====================================================================
create policy "authenticated users can read published announcements" on public.announcements for select to authenticated
  using ((is_published = true));

create policy "portal admins can manage announcements" on public.announcements for all to authenticated
  using (is_portal_admin())
  with check (is_portal_admin());

create policy approve_documents_delete on public.approve_documents for delete to public
  using (((created_by = auth.uid()) AND (status = ANY (ARRAY['draft'::text, 'pending'::text]))));

create policy approve_documents_insert on public.approve_documents for insert to public
  with check ((created_by = auth.uid()));

create policy approve_documents_select on public.approve_documents for select to public
  using (((created_by = auth.uid()) OR approve_is_signer(id, auth.uid())));

create policy approve_documents_update on public.approve_documents for update to public
  using ((created_by = auth.uid()))
  with check ((created_by = auth.uid()));

create policy approve_fields_delete on public.approve_fields for delete to public
  using ((approve_is_creator(document_id, auth.uid()) AND (approve_doc_status(document_id) = 'draft'::text)));

create policy approve_fields_insert on public.approve_fields for insert to public
  with check ((approve_is_creator(document_id, auth.uid()) AND (approve_doc_status(document_id) = 'draft'::text)));

create policy approve_fields_select on public.approve_fields for select to public
  using (((signer_id = auth.uid()) OR approve_is_creator(document_id, auth.uid())));

create policy approve_fields_update on public.approve_fields for update to public
  using (((signer_id = auth.uid()) OR (approve_is_creator(document_id, auth.uid()) AND (approve_doc_status(document_id) = 'draft'::text))))
  with check (((signer_id = auth.uid()) OR (approve_is_creator(document_id, auth.uid()) AND (approve_doc_status(document_id) = 'draft'::text))));

create policy approve_signers_delete on public.approve_signers for delete to public
  using ((approve_is_creator(document_id, auth.uid()) AND (approve_doc_status(document_id) = ANY (ARRAY['draft'::text, 'pending'::text]))));

create policy approve_signers_insert on public.approve_signers for insert to public
  with check (approve_is_creator(document_id, auth.uid()));

create policy approve_signers_select on public.approve_signers for select to public
  using (((signer_id = auth.uid()) OR approve_is_creator(document_id, auth.uid())));

create policy approve_signers_update on public.approve_signers for update to public
  using ((signer_id = auth.uid()))
  with check ((signer_id = auth.uid()));

create policy approve_user_field_values_delete on public.approve_user_field_values for delete to public
  using ((user_id = auth.uid()));

create policy approve_user_field_values_insert on public.approve_user_field_values for insert to public
  with check ((user_id = auth.uid()));

create policy approve_user_field_values_select on public.approve_user_field_values for select to public
  using ((user_id = auth.uid()));

create policy approve_user_field_values_update on public.approve_user_field_values for update to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Admins can manage menu items" on public.bento_menu_items for all to public
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))))
  with check ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))));

create policy "Anyone can view menu items" on public.bento_menu_items for select to public
  using (true);

create policy "Admins can delete menus" on public.bento_menus for delete to public
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))));

create policy "Admins can insert menus" on public.bento_menus for insert to public
  with check ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))));

create policy "Admins can update menus" on public.bento_menus for update to public
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))));

create policy "Anyone can view menus" on public.bento_menus for select to public
  using (true);

create policy "Admins can delete any order items" on public.bento_order_items for delete to public
  using (has_role(auth.uid(), 'bento'::text, 'admin'::text));

create policy "Admins can insert order items for any user" on public.bento_order_items for insert to public
  with check (has_role(auth.uid(), 'bento'::text, 'admin'::text));

create policy "Allow anonymous order item inserts on active orders" on public.bento_order_items for insert to public
  with check (((user_id IS NULL) AND (anonymous_name IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bento_orders
  WHERE ((bento_orders.id = bento_order_items.order_id) AND (bento_orders.status = 'active'::text))))));

create policy "Anyone can view order items" on public.bento_order_items for select to public
  using (true);

create policy "Users can delete own order items" on public.bento_order_items for delete to public
  using ((auth.uid() = user_id));

create policy "Users can insert own order items" on public.bento_order_items for insert to public
  with check ((auth.uid() = user_id));

create policy "Admins can manage orders" on public.bento_orders for all to public
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))))
  with check ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles ? 'bento'::text) AND ((user_profiles.roles -> 'bento'::text) ? 'admin'::text)))))));

create policy "Anyone can view orders" on public.bento_orders for select to public
  using (true);

create policy "Anyone can view ratings" on public.bento_ratings for select to public
  using (true);

create policy "Users can delete own ratings" on public.bento_ratings for delete to public
  using ((auth.uid() = user_id));

create policy "Users can insert own ratings" on public.bento_ratings for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can update own ratings" on public.bento_ratings for update to public
  using ((auth.uid() = user_id));

create policy "authenticated users can read mentions" on public.bulletin_message_mentions for select to authenticated
  using (true);

create policy "authenticated users can post messages" on public.bulletin_messages for insert to authenticated
  with check (((author_id = auth.uid()) AND ((is_broadcast = false) OR is_portal_admin())));

create policy "authenticated users can read messages" on public.bulletin_messages for select to authenticated
  using (true);

create policy "authors and admins can delete messages" on public.bulletin_messages for delete to authenticated
  using (((author_id = auth.uid()) OR is_portal_admin()));

create policy "Users can insert own claims" on public.claims for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Users can update own claims" on public.claims for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "Users can view claims" on public.claims for select to authenticated
  using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.roles -> 'claims'::text) ? 'admin'::text))))));

create policy delete_own_expense on public.debit_expense_items for delete to public
  using ((expense_id IN ( SELECT debit_expenses.id
   FROM debit_expenses
  WHERE (debit_expenses.creator_id = auth.uid()))));

create policy insert_own_expense on public.debit_expense_items for insert to public
  with check ((expense_id IN ( SELECT debit_expenses.id
   FROM debit_expenses
  WHERE (debit_expenses.creator_id = auth.uid()))));

create policy select_own_or_debtor on public.debit_expense_items for select to public
  using (((debtor_id = auth.uid()) OR (expense_id IN ( SELECT debit_expenses.id
   FROM debit_expenses
  WHERE (debit_expenses.creator_id = auth.uid())))));

create policy update_own_expense on public.debit_expense_items for update to public
  using ((expense_id IN ( SELECT debit_expenses.id
   FROM debit_expenses
  WHERE (debit_expenses.creator_id = auth.uid()))));

create policy delete_own on public.debit_expenses for delete to public
  using ((creator_id = auth.uid()));

create policy insert_own on public.debit_expenses for insert to public
  with check ((creator_id = auth.uid()));

create policy select_own_or_debtor on public.debit_expenses for select to public
  using (((creator_id = auth.uid()) OR is_expense_debtor(id)));

create policy update_own on public.debit_expenses for update to public
  using ((creator_id = auth.uid()));

create policy select_own on public.debit_settlements for select to public
  using (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())));

create policy debt_expense_items_delete on public.debt_expense_items for delete to public
  using ((expense_id IN ( SELECT debt_expenses.id
   FROM debt_expenses
  WHERE (debt_expenses.creator_id = auth.uid()))));

create policy debt_expense_items_insert on public.debt_expense_items for insert to public
  with check ((expense_id IN ( SELECT debt_expenses.id
   FROM debt_expenses
  WHERE (debt_expenses.creator_id = auth.uid()))));

create policy debt_expense_items_select on public.debt_expense_items for select to public
  using (((debtor_id = auth.uid()) OR (expense_id IN ( SELECT debt_expenses.id
   FROM debt_expenses
  WHERE (debt_expenses.creator_id = auth.uid())))));

create policy debt_expense_items_update on public.debt_expense_items for update to public
  using ((expense_id IN ( SELECT debt_expenses.id
   FROM debt_expenses
  WHERE (debt_expenses.creator_id = auth.uid()))));

create policy debt_expenses_delete on public.debt_expenses for delete to public
  using ((creator_id = auth.uid()));

create policy debt_expenses_insert on public.debt_expenses for insert to public
  with check ((creator_id = auth.uid()));

create policy debt_expenses_select on public.debt_expenses for select to public
  using (((creator_id = auth.uid()) OR is_debt_expense_debtor(id)));

create policy debt_expenses_update on public.debt_expenses for update to public
  using ((creator_id = auth.uid()));

create policy debt_settlements_select on public.debt_settlements for select to public
  using (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())));

create policy egress_delete_admin on public.egress for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.is_admin = true) OR ((user_profiles.roles -> 'reimburse'::text) @> '["admin"]'::jsonb))))));

create policy egress_insert_own on public.egress for insert to authenticated
  with check ((auth.uid() = user_id));

create policy egress_select_authenticated on public.egress for select to authenticated
  using (true);

create policy egress_update_own on public.egress for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy gallery_image_votes_delete on public.gallery_image_votes for delete to public
  using ((user_id = auth.uid()));

create policy gallery_image_votes_insert on public.gallery_image_votes for insert to public
  with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));

create policy gallery_image_votes_select on public.gallery_image_votes for select to public
  using (true);

create policy gallery_image_votes_update on public.gallery_image_votes for update to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy gallery_images_delete on public.gallery_images for delete to public
  using ((created_by = auth.uid()));

create policy gallery_images_insert on public.gallery_images for insert to public
  with check (((auth.uid() IS NOT NULL) AND (created_by = auth.uid())));

create policy gallery_images_select on public.gallery_images for select to public
  using (true);

create policy gallery_images_update on public.gallery_images for update to public
  using ((created_by = auth.uid()))
  with check ((created_by = auth.uid()));

create policy "authenticated users can read game scores" on public.game_scores for select to authenticated
  using (true);

create policy "game_scores deny delete" on public.game_scores as restrictive for delete to anon, authenticated
  using (false);

create policy "game_scores deny update" on public.game_scores as restrictive for update to anon, authenticated
  using (false)
  with check (false);

create policy "Authenticated insert" on public.images for insert to public
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));

create policy "Owner delete" on public.images for delete to public
  using ((( SELECT auth.uid() AS uid) = user_id));

create policy "Public read access" on public.images for select to public
  using (true);

create policy "Allow deleting ingress records" on public.ingress for delete to public
  using (((user_id IS NULL) OR (auth.uid() = user_id)));

create policy "Allow inserting ingress records" on public.ingress for insert to public
  with check (((user_id IS NULL) OR (auth.uid() = user_id)));

create policy "Allow updating ingress records" on public.ingress for update to public
  using (((user_id IS NULL) OR (auth.uid() = user_id)));

create policy "Allow viewing all ingress records" on public.ingress for select to public
  using (true);

create policy "Authenticated users can read all invoices" on public.invoice for select to public
  using ((auth.uid() IS NOT NULL));

create policy "Invoice admin can update invoice status" on public.invoice for update to public
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.roles -> 'invoice'::text) @> '["admin"]'::jsonb)))))
  with check ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.roles -> 'invoice'::text) @> '["admin"]'::jsonb)))));

create policy "Users can delete own invoices" on public.invoice for delete to public
  using ((auth.uid() = user_id));

create policy "Users can insert own invoices" on public.invoice for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can update own invoices" on public.invoice for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "Users can delete own items" on public.items for delete to public
  using ((auth.uid() = user_id));

create policy "Users can insert own items" on public.items for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can update own items" on public.items for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "Users can view own items" on public.items for select to public
  using ((auth.uid() = user_id));

create policy "Allow authenticated users to view leaves" on public.leaves for select to authenticated
  using (true);

create policy "Allow users to delete their own leaves" on public.leaves for delete to authenticated
  using ((auth.uid() = user_id));

create policy "Allow users to insert their own leaves" on public.leaves for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Allow users to update their own leaves" on public.leaves for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "anon can read mcp oauth clients" on public.mcp_oauth_clients for select to anon
  using (true);

create policy "anon can register mcp oauth clients" on public.mcp_oauth_clients for insert to anon
  with check (((char_length(client_id) > 0) AND (char_length(client_name) > 0) AND (jsonb_typeof(redirect_uris) = 'array'::text) AND (jsonb_array_length(redirect_uris) > 0) AND (jsonb_typeof(grant_types) = 'array'::text) AND (jsonb_array_length(grant_types) > 0) AND (jsonb_typeof(response_types) = 'array'::text) AND (jsonb_array_length(response_types) > 0)));

create policy "authenticated read meeting_groups" on public.meeting_groups for select to authenticated
  using (true);

create policy "meetings admin write meeting_groups" on public.meeting_groups for all to authenticated
  using (is_meetings_admin())
  with check (is_meetings_admin());

create policy meetings_delete on public.meetings for delete to public
  using (is_meetings_admin());

create policy meetings_insert on public.meetings for insert to public
  with check (is_meetings_admin());

create policy meetings_select on public.meetings for select to public
  using ((auth.uid() IS NOT NULL));

create policy meetings_update_admin on public.meetings for update to public
  using (is_meetings_admin())
  with check (is_meetings_admin());

create policy meetings_update_own on public.meetings for update to public
  using ((presenter_user_id = auth.uid()))
  with check ((presenter_user_id = auth.uid()));

create policy "Admins can manage members" on public.members for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE (((user_profiles.id = auth.uid()) AND ((user_profiles.roles ->> 'directory'::text) = '"admin"'::text)) OR (user_profiles.is_admin = true)))));

create policy "Authenticated users can view members" on public.members for select to authenticated
  using (true);

create policy "Anyone can insert notepads" on public.notepads for insert to public
  with check (true);

create policy "Anyone can read notepads" on public.notepads for select to public
  using (true);

create policy "Anyone can update notepads" on public.notepads for update to public
  using (true);

create policy receipt_tag_assignments_delete on public.receipt_tag_assignments for delete to public
  using (is_receipts_admin());

create policy receipt_tag_assignments_insert on public.receipt_tag_assignments for insert to public
  with check (is_receipts_admin());

create policy receipt_tag_assignments_select on public.receipt_tag_assignments for select to public
  using (is_receipts_admin());

create policy receipt_tags_delete on public.receipt_tags for delete to public
  using (is_receipts_admin());

create policy receipt_tags_insert on public.receipt_tags for insert to public
  with check (is_receipts_admin());

create policy receipt_tags_select on public.receipt_tags for select to public
  using (is_receipts_admin());

create policy receipt_tags_update on public.receipt_tags for update to public
  using (is_receipts_admin())
  with check (is_receipts_admin());

create policy receipts_delete on public.receipts for delete to public
  using (is_receipts_admin());

create policy receipts_insert on public.receipts for insert to public
  with check (is_receipts_admin());

create policy receipts_select on public.receipts for select to public
  using (is_receipts_admin());

create policy receipts_update on public.receipts for update to public
  using (is_receipts_admin())
  with check (is_receipts_admin());

create policy reimburse_egress_delete on public.reimburse_egress for delete to public
  using (is_reimburse_admin());

create policy reimburse_egress_insert on public.reimburse_egress for insert to public
  with check (is_reimburse_admin());

create policy reimburse_egress_select on public.reimburse_egress for select to public
  using ((auth.uid() IS NOT NULL));

create policy reimburse_egress_update on public.reimburse_egress for update to public
  using (is_reimburse_admin())
  with check (is_reimburse_admin());

create policy reimburse_ingress_delete on public.reimburse_ingress for delete to public
  using (is_reimburse_admin());

create policy reimburse_ingress_insert on public.reimburse_ingress for insert to public
  with check (is_reimburse_admin());

create policy reimburse_ingress_select on public.reimburse_ingress for select to public
  using ((auth.uid() IS NOT NULL));

create policy reimburse_ingress_update on public.reimburse_ingress for update to public
  using (is_reimburse_admin())
  with check (is_reimburse_admin());

create policy teacher_papers_delete on public.teacher_papers for delete to public
  using (is_meetings_admin());

create policy teacher_papers_insert on public.teacher_papers for insert to public
  with check (is_meetings_admin());

create policy teacher_papers_select on public.teacher_papers for select to public
  using ((auth.uid() IS NOT NULL));

create policy teacher_papers_update on public.teacher_papers for update to public
  using (is_meetings_admin())
  with check (is_meetings_admin());

create policy trip_files_delete on public.trip_files for delete to public
  using ((((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM trips t
  WHERE ((t.id = trip_files.trip_id) AND (t.status = 'open'::text))))) OR is_trip_admin()));

create policy trip_files_insert on public.trip_files for insert to public
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM trips t
  WHERE ((t.id = trip_files.trip_id) AND (t.status = 'open'::text))))));

create policy trip_files_select on public.trip_files for select to public
  using (((user_id = auth.uid()) OR is_trip_admin()));

create policy trip_files_update on public.trip_files for update to public
  using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM trips t
  WHERE ((t.id = trip_files.trip_id) AND (t.status = 'open'::text))))))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM trips t
  WHERE ((t.id = trip_files.trip_id) AND (t.status = 'open'::text))))));

create policy trips_delete on public.trips for delete to public
  using (is_trip_admin());

create policy trips_insert on public.trips for insert to public
  with check (is_trip_admin());

create policy trips_select on public.trips for select to public
  using ((auth.uid() IS NOT NULL));

create policy trips_update on public.trips for update to public
  using (is_trip_admin())
  with check (is_trip_admin());

create policy "Anonymous can view all user names" on public.user_profiles for select to anon
  using (true);

create policy "Authenticated users can view all profiles for document signing" on public.user_profiles for select to authenticated
  using (true);

create policy "Users can view names in shared orders" on public.user_profiles for select to authenticated
  using (((auth.uid() = id) OR (EXISTS ( SELECT 1
   FROM bento_order_items oi
  WHERE (oi.user_id = user_profiles.id)))));

create policy user_profiles_update_own on public.user_profiles for update to authenticated
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

create policy user_sign_prefs_delete_own on public.user_sign_prefs for delete to public
  using ((user_id = auth.uid()));

create policy user_sign_prefs_insert_own on public.user_sign_prefs for insert to public
  with check ((user_id = auth.uid()));

create policy user_sign_prefs_select on public.user_sign_prefs for select to public
  using (((user_id = auth.uid()) OR is_trip_admin()));

create policy user_sign_prefs_update_own on public.user_sign_prefs for update to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));


-- =====================================================================
-- 12. GRANTS
-- =====================================================================
-- Mirrors prod exactly. The blanket DELETE/INSERT/REFERENCES/SELECT/
-- TRIGGER/TRUNCATE/UPDATE grant to anon/authenticated is the supabase
-- default (ALTER DEFAULT PRIVILEGES) — RLS is what actually constrains
-- these roles, NOT the table grants. The two views also carry these grants.
--
-- Roles anon / authenticated / service_role must exist (supabase provides
-- them). On bare Postgres: create role anon nologin; etc., first.

-- ----- TABLE / VIEW GRANTS -----
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.announcements to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.announcements to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.announcements to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_documents to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_documents to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_documents to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_email_outbox to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_email_outbox to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_email_outbox to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_fields to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_fields to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_fields to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_signers to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_signers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_signers to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_user_field_values to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_user_field_values to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.approve_user_field_values to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_auth_codes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_auth_codes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_auth_codes to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_clients to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_clients to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_mcp_clients to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menu_items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menu_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menu_items to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menus to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menus to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_menus to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_items to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_stats to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_stats to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_order_stats to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_orders to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_orders to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_orders to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_ratings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_ratings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_ratings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_user_rankings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_user_rankings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bento_user_rankings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_message_mentions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_message_mentions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_message_mentions to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_messages to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bulletin_messages to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.claims to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.claims to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.claims to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expense_items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expense_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expense_items to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expenses to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expenses to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_expenses to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_settlements to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_settlements to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debit_settlements to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expense_items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expense_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expense_items to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expenses to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expenses to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_expenses to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_settlements to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_settlements to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.debt_settlements to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.egress to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.egress to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.egress to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_image_votes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_image_votes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_image_votes to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_images to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_images to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.gallery_images to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.game_scores to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.game_scores to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.game_scores to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.images to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.images to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.images to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ingress to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ingress to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ingress to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.invoice to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.invoice to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.invoice to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.items to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.items to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.leaves to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.leaves to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.leaves to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_auth_codes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_auth_codes to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_auth_codes to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_clients to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_clients to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.mcp_oauth_clients to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meeting_groups to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meeting_groups to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meeting_groups to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meetings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meetings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.meetings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.members to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.members to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.members to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notepads to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notepads to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notepads to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pending_bot_bindings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pending_bot_bindings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.pending_bot_bindings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tag_assignments to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tag_assignments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tag_assignments to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tags to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tags to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipt_tags to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipts to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.receipts to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_egress to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_egress to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_egress to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_ingress to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_ingress to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.reimburse_ingress to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.teacher_papers to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.teacher_papers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.teacher_papers to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trip_files to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trip_files to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trip_files to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trips to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trips to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.trips to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_profiles to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_profiles to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_profiles to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_sign_prefs to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_sign_prefs to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.user_sign_prefs to service_role;

-- ----- FUNCTION (EXECUTE) GRANTS -----
-- SECURITY NOTE: submit_game_score is granted ONLY to authenticated +
-- service_role (NOT anon) — deliberate; preserve it.
grant execute on function public.approve_doc_status(doc_id uuid) to anon;
grant execute on function public.approve_doc_status(doc_id uuid) to authenticated;
grant execute on function public.approve_doc_status(doc_id uuid) to service_role;
grant execute on function public.approve_enqueue_emails() to anon;
grant execute on function public.approve_enqueue_emails() to authenticated;
grant execute on function public.approve_enqueue_emails() to service_role;
grant execute on function public.approve_is_creator(doc_id uuid, uid uuid) to anon;
grant execute on function public.approve_is_creator(doc_id uuid, uid uuid) to authenticated;
grant execute on function public.approve_is_creator(doc_id uuid, uid uuid) to service_role;
grant execute on function public.approve_is_signer(doc_id uuid, uid uuid) to anon;
grant execute on function public.approve_is_signer(doc_id uuid, uid uuid) to authenticated;
grant execute on function public.approve_is_signer(doc_id uuid, uid uuid) to service_role;
grant execute on function public.approve_profile_stats(p_user_id uuid) to anon;
grant execute on function public.approve_profile_stats(p_user_id uuid) to authenticated;
grant execute on function public.approve_profile_stats(p_user_id uuid) to service_role;
grant execute on function public.approve_submit_signature(p_document_id uuid, p_values jsonb) to anon;
grant execute on function public.approve_submit_signature(p_document_id uuid, p_values jsonb) to authenticated;
grant execute on function public.approve_submit_signature(p_document_id uuid, p_values jsonb) to service_role;
grant execute on function public.approve_touch_updated_at() to anon;
grant execute on function public.approve_touch_updated_at() to authenticated;
grant execute on function public.approve_touch_updated_at() to service_role;
grant execute on function public.bento_profile_stats(p_user_id uuid) to anon;
grant execute on function public.bento_profile_stats(p_user_id uuid) to authenticated;
grant execute on function public.bento_profile_stats(p_user_id uuid) to service_role;
grant execute on function public.can_sign_document(doc_id uuid) to anon;
grant execute on function public.can_sign_document(doc_id uuid) to authenticated;
grant execute on function public.can_sign_document(doc_id uuid) to service_role;
grant execute on function public.can_view_document_signers(doc_id uuid) to anon;
grant execute on function public.can_view_document_signers(doc_id uuid) to authenticated;
grant execute on function public.can_view_document_signers(doc_id uuid) to service_role;
grant execute on function public.can_view_signature_boxes(doc_id uuid) to anon;
grant execute on function public.can_view_signature_boxes(doc_id uuid) to authenticated;
grant execute on function public.can_view_signature_boxes(doc_id uuid) to service_role;
grant execute on function public.check_debtor_not_creator() to anon;
grant execute on function public.check_debtor_not_creator() to authenticated;
grant execute on function public.check_debtor_not_creator() to service_role;
grant execute on function public.confirm_settlement_from(p_settlement_id uuid) to anon;
grant execute on function public.confirm_settlement_from(p_settlement_id uuid) to authenticated;
grant execute on function public.confirm_settlement_from(p_settlement_id uuid) to service_role;
grant execute on function public.confirm_settlement_to(p_settlement_id uuid) to anon;
grant execute on function public.confirm_settlement_to(p_settlement_id uuid) to authenticated;
grant execute on function public.confirm_settlement_to(p_settlement_id uuid) to service_role;
grant execute on function public.create_bento_order(p_restaurant_id uuid, p_order_date date, p_auto_close_at timestamp with time zone) to anon;
grant execute on function public.create_bento_order(p_restaurant_id uuid, p_order_date date, p_auto_close_at timestamp with time zone) to authenticated;
grant execute on function public.create_bento_order(p_restaurant_id uuid, p_order_date date, p_auto_close_at timestamp with time zone) to service_role;
grant execute on function public.create_expense(p_name text, p_description text, p_items jsonb) to anon;
grant execute on function public.create_expense(p_name text, p_description text, p_items jsonb) to authenticated;
grant execute on function public.create_expense(p_name text, p_description text, p_items jsonb) to service_role;
grant execute on function public.debt_check_debtor_not_creator() to anon;
grant execute on function public.debt_check_debtor_not_creator() to authenticated;
grant execute on function public.debt_check_debtor_not_creator() to service_role;
grant execute on function public.debt_confirm_settlement_from(p_settlement_id uuid) to anon;
grant execute on function public.debt_confirm_settlement_from(p_settlement_id uuid) to authenticated;
grant execute on function public.debt_confirm_settlement_from(p_settlement_id uuid) to service_role;
grant execute on function public.debt_confirm_settlement_to(p_settlement_id uuid) to anon;
grant execute on function public.debt_confirm_settlement_to(p_settlement_id uuid) to authenticated;
grant execute on function public.debt_confirm_settlement_to(p_settlement_id uuid) to service_role;
grant execute on function public.debt_create_expense(p_name text, p_description text, p_items jsonb) to anon;
grant execute on function public.debt_create_expense(p_name text, p_description text, p_items jsonb) to authenticated;
grant execute on function public.debt_create_expense(p_name text, p_description text, p_items jsonb) to service_role;
grant execute on function public.debt_generate_monthly_settlements() to anon;
grant execute on function public.debt_generate_monthly_settlements() to authenticated;
grant execute on function public.debt_generate_monthly_settlements() to service_role;
grant execute on function public.debt_mark_item_paid(p_item_id uuid, p_paid boolean) to anon;
grant execute on function public.debt_mark_item_paid(p_item_id uuid, p_paid boolean) to authenticated;
grant execute on function public.debt_mark_item_paid(p_item_id uuid, p_paid boolean) to service_role;
grant execute on function public.debt_update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to anon;
grant execute on function public.debt_update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to authenticated;
grant execute on function public.debt_update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to service_role;
grant execute on function public.generate_monthly_settlements() to anon;
grant execute on function public.generate_monthly_settlements() to authenticated;
grant execute on function public.generate_monthly_settlements() to service_role;
grant execute on function public.generate_short_id(length integer) to anon;
grant execute on function public.generate_short_id(length integer) to authenticated;
grant execute on function public.generate_short_id(length integer) to service_role;
grant execute on function public.get_game_leaderboard(p_game_type game_type, p_level smallint) to anon;
grant execute on function public.get_game_leaderboard(p_game_type game_type, p_level smallint) to authenticated;
grant execute on function public.get_game_leaderboard(p_game_type game_type, p_level smallint) to service_role;
grant execute on function public.get_profile_stats(p_user_id uuid) to anon;
grant execute on function public.get_profile_stats(p_user_id uuid) to authenticated;
grant execute on function public.get_profile_stats(p_user_id uuid) to service_role;
grant execute on function public.get_user_email() to anon;
grant execute on function public.get_user_email() to authenticated;
grant execute on function public.get_user_email() to service_role;
grant execute on function public.handle_new_user() to anon;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.has_any_role_in_system(user_id_param uuid, system_name text) to anon;
grant execute on function public.has_any_role_in_system(user_id_param uuid, system_name text) to authenticated;
grant execute on function public.has_any_role_in_system(user_id_param uuid, system_name text) to service_role;
grant execute on function public.has_role(user_id_param uuid, system_name text, role_name text) to anon;
grant execute on function public.has_role(user_id_param uuid, system_name text, role_name text) to authenticated;
grant execute on function public.has_role(user_id_param uuid, system_name text, role_name text) to service_role;
grant execute on function public.is_debt_expense_debtor(expense_uuid uuid) to anon;
grant execute on function public.is_debt_expense_debtor(expense_uuid uuid) to authenticated;
grant execute on function public.is_debt_expense_debtor(expense_uuid uuid) to service_role;
grant execute on function public.is_expense_debtor(expense_uuid uuid) to anon;
grant execute on function public.is_expense_debtor(expense_uuid uuid) to authenticated;
grant execute on function public.is_expense_debtor(expense_uuid uuid) to service_role;
grant execute on function public.is_meetings_admin() to anon;
grant execute on function public.is_meetings_admin() to authenticated;
grant execute on function public.is_meetings_admin() to service_role;
grant execute on function public.is_portal_admin() to anon;
grant execute on function public.is_portal_admin() to authenticated;
grant execute on function public.is_portal_admin() to service_role;
grant execute on function public.is_receipts_admin() to anon;
grant execute on function public.is_receipts_admin() to authenticated;
grant execute on function public.is_receipts_admin() to service_role;
grant execute on function public.is_reimburse_admin() to anon;
grant execute on function public.is_reimburse_admin() to authenticated;
grant execute on function public.is_reimburse_admin() to service_role;
grant execute on function public.is_trip_admin() to anon;
grant execute on function public.is_trip_admin() to authenticated;
grant execute on function public.is_trip_admin() to service_role;
grant execute on function public.leave_profile_stats(p_user_id uuid) to anon;
grant execute on function public.leave_profile_stats(p_user_id uuid) to authenticated;
grant execute on function public.leave_profile_stats(p_user_id uuid) to service_role;
grant execute on function public.mark_item_paid(p_item_id uuid, p_paid boolean) to anon;
grant execute on function public.mark_item_paid(p_item_id uuid, p_paid boolean) to authenticated;
grant execute on function public.mark_item_paid(p_item_id uuid, p_paid boolean) to service_role;
grant execute on function public.mcp_create_oauth_auth_code(p_code text, p_data jsonb) to anon;
grant execute on function public.mcp_create_oauth_auth_code(p_code text, p_data jsonb) to authenticated;
grant execute on function public.mcp_create_oauth_auth_code(p_code text, p_data jsonb) to service_role;
grant execute on function public.mcp_exchange_oauth_auth_code(p_code text) to anon;
grant execute on function public.mcp_exchange_oauth_auth_code(p_code text) to authenticated;
grant execute on function public.mcp_exchange_oauth_auth_code(p_code text) to service_role;
grant execute on function public.portal_admin_get_users() to anon;
grant execute on function public.portal_admin_get_users() to authenticated;
grant execute on function public.portal_admin_get_users() to service_role;
grant execute on function public.portal_admin_update_user(p_target_id uuid, p_roles jsonb, p_is_admin boolean) to anon;
grant execute on function public.portal_admin_update_user(p_target_id uuid, p_roles jsonb, p_is_admin boolean) to authenticated;
grant execute on function public.portal_admin_update_user(p_target_id uuid, p_roles jsonb, p_is_admin boolean) to service_role;
grant execute on function public.prevent_egress_status_change() to anon;
grant execute on function public.prevent_egress_status_change() to authenticated;
grant execute on function public.prevent_egress_status_change() to service_role;
grant execute on function public.prevent_role_escalation() to anon;
grant execute on function public.prevent_role_escalation() to authenticated;
grant execute on function public.prevent_role_escalation() to service_role;
grant execute on function public.receipts_set_updated_at() to anon;
grant execute on function public.receipts_set_updated_at() to authenticated;
grant execute on function public.receipts_set_updated_at() to service_role;
grant execute on function public.reimburse_set_updated_at() to anon;
grant execute on function public.reimburse_set_updated_at() to authenticated;
grant execute on function public.reimburse_set_updated_at() to service_role;
grant execute on function public.submit_game_score(p_game_type game_type, p_score integer, p_finish_ms integer, p_level smallint) to authenticated;
grant execute on function public.submit_game_score(p_game_type game_type, p_score integer, p_finish_ms integer, p_level smallint) to service_role;
grant execute on function public.trip_admin_get_member_signatures(p_trip_id uuid) to anon;
grant execute on function public.trip_admin_get_member_signatures(p_trip_id uuid) to authenticated;
grant execute on function public.trip_admin_get_member_signatures(p_trip_id uuid) to service_role;
grant execute on function public.trip_profile_stats(p_user_id uuid) to anon;
grant execute on function public.trip_profile_stats(p_user_id uuid) to authenticated;
grant execute on function public.trip_profile_stats(p_user_id uuid) to service_role;
grant execute on function public.update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to anon;
grant execute on function public.update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to authenticated;
grant execute on function public.update_expense(p_expense_id uuid, p_name text, p_description text, p_items jsonb) to service_role;
grant execute on function public.update_invoice_invoices_updated_at() to anon;
grant execute on function public.update_invoice_invoices_updated_at() to authenticated;
grant execute on function public.update_invoice_invoices_updated_at() to service_role;
grant execute on function public.update_members_updated_at() to anon;
grant execute on function public.update_members_updated_at() to authenticated;
grant execute on function public.update_members_updated_at() to service_role;
grant execute on function public.update_updated_at_column() to anon;
grant execute on function public.update_updated_at_column() to authenticated;
grant execute on function public.update_updated_at_column() to service_role;
grant execute on function public.upsert_user_profile(p_email text, p_name text) to anon;
grant execute on function public.upsert_user_profile(p_email text, p_name text) to authenticated;
grant execute on function public.upsert_user_profile(p_email text, p_name text) to service_role;

-- =====================================================================
-- END OF DUMP
-- =====================================================================
