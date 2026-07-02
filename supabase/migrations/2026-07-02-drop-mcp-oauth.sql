-- Remove the unused MCP OAuth server (audit #182): the app is being deleted,
-- so these tables/functions are orphaned. Dropping them also closes the
-- anon-callable exchange RPC + world-readable clients table.
drop function if exists public.mcp_exchange_oauth_auth_code(p_code text);
drop function if exists public.mcp_create_oauth_auth_code(p_code text, p_data jsonb);
drop table if exists public.mcp_oauth_auth_codes;
drop table if exists public.mcp_oauth_clients;
