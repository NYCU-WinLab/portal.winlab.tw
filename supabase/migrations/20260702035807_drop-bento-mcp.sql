-- Remove the orphaned bento MCP OAuth tables: the bento.winlab.tw MCP server is
-- no longer in the codebase (no routes, no edge function, no RPCs reference these),
-- and the audit flagged bento_mcp_auth_codes as having no RLS policy (token-harvest
-- risk). Drop auth_codes first (it FKs to clients), then clients.
drop table if exists public.bento_mcp_auth_codes;
drop table if exists public.bento_mcp_clients;
