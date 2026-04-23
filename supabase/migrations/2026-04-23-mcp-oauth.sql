-- OAuth 2.1 infrastructure for mcp.winlab.tw
-- Pattern lifted from mcp.ai.winlab.tw. Tables prefixed with mcp_ to
-- namespace within the shared Supabase project.

-- ---------------------------------------------------------------------------
-- mcp_oauth_clients: dynamic client registration (RFC 7591)
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris jsonb not null,
  grant_types jsonb not null,
  response_types jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.mcp_oauth_clients is
  'Dynamic OAuth 2.1 client registrations for MCP clients. Public (token_endpoint_auth_method = none); identity proven via PKCE at /oauth/token.';

alter table public.mcp_oauth_clients enable row level security;

drop policy if exists "anon can register mcp oauth clients" on public.mcp_oauth_clients;
create policy "anon can register mcp oauth clients"
  on public.mcp_oauth_clients for insert
  to anon
  with check (
    char_length(client_id) > 0
    and char_length(client_name) > 0
    and jsonb_typeof(redirect_uris) = 'array'
    and jsonb_array_length(redirect_uris) > 0
    and jsonb_typeof(grant_types) = 'array'
    and jsonb_array_length(grant_types) > 0
    and jsonb_typeof(response_types) = 'array'
    and jsonb_array_length(response_types) > 0
  );

drop policy if exists "anon can read mcp oauth clients" on public.mcp_oauth_clients;
create policy "anon can read mcp oauth clients"
  on public.mcp_oauth_clients for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- mcp_oauth_auth_codes: one-time short-lived codes bound to Supabase session
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_oauth_auth_codes (
  code text primary key,
  data jsonb not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

comment on table public.mcp_oauth_auth_codes is
  'Short-lived one-time OAuth authorization codes. Written and consumed only via SECURITY DEFINER functions below; direct access denied by RLS.';

alter table public.mcp_oauth_auth_codes enable row level security;

create index if not exists mcp_oauth_auth_codes_expires_at_idx
  on public.mcp_oauth_auth_codes (expires_at);

-- Atomic insert
create or replace function public.mcp_create_oauth_auth_code(p_code text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mcp_oauth_auth_codes (code, data)
  values (p_code, p_data);
end;
$$;

-- Atomic exchange: delete + return data if still valid.
-- Stale rows are deleted even when returning null so a rotating code value
-- is never replayable.
create or replace function public.mcp_exchange_oauth_auth_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.mcp_create_oauth_auth_code(text, jsonb) from public;
revoke all on function public.mcp_exchange_oauth_auth_code(text) from public;
grant execute on function public.mcp_create_oauth_auth_code(text, jsonb) to anon, authenticated;
grant execute on function public.mcp_exchange_oauth_auth_code(text) to anon, authenticated;
