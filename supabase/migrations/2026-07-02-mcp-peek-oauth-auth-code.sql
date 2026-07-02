-- Fix OAuth code-burning DoS (audit #182): mcp_exchange_oauth_auth_code is an
-- atomic delete-on-read RPC, so any /oauth/token attempt (even with a wrong
-- code_verifier) permanently consumes the code before PKCE is checked. Add a
-- read-only peek RPC so the token route can validate everything (redirect_uri,
-- client_id, resource, PKCE) *before* the code is ever consumed.
--
-- Security-critical: this function must only ever return the metadata needed
-- to validate the request. It must NEVER return access_token, refresh_token,
-- or the raw `data` payload — doing so would leak tokens without a valid PKCE
-- verifier, which is strictly worse than the bug it fixes.
CREATE OR REPLACE FUNCTION public.mcp_peek_oauth_auth_code(p_code text)
 RETURNS TABLE (
   client_id text,
   redirect_uri text,
   resource text,
   code_challenge text,
   expires_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    (c.data ->> 'clientId')::text,
    (c.data ->> 'redirectUri')::text,
    (c.data ->> 'resource')::text,
    (c.data ->> 'codeChallenge')::text,
    c.expires_at
  from public.mcp_oauth_auth_codes c
  where c.code = p_code
    and c.expires_at >= now();
end;
$function$
;

grant execute on function public.mcp_peek_oauth_auth_code(p_code text) to anon;
grant execute on function public.mcp_peek_oauth_auth_code(p_code text) to authenticated;
grant execute on function public.mcp_peek_oauth_auth_code(p_code text) to service_role;
