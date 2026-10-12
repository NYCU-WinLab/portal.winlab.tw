-- Only Keycloak may create a portal account.
--
-- Google sign-in stays on as a fallback for when Keycloak is down, but only
-- for members who already have an account: Supabase links a Google identity
-- to the existing user with the same verified email, which creates no user
-- and so never reaches this hook. Anything that would create a new user
-- through any other provider is refused, because membership is decided by the
-- Keycloak realm and a Google account on its own proves nothing.
--
-- Supabase Auth calls this as the before-user-created hook, wired up in the
-- project's auth config (hook_before_user_created_uri =
-- pg-functions://postgres/public/hook_before_user_created), and in
-- config.toml for the local stack. Users created through the Admin API with
-- the service role skip it, so local seeding keeps working.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if event->'user'->'app_metadata'->>'provider' = 'keycloak' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your WinLab Keycloak account first. '
        || 'Google sign-in only works for members who already have a portal account.'
    )
  );
end;
$function$;

-- Only Supabase Auth calls it. Named roles too: this project's default
-- privileges hand anon/authenticated/service_role EXECUTE on every new
-- function, so revoking from PUBLIC alone would leave those grants in place.
revoke execute on function public.hook_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb)
  to supabase_auth_admin;
