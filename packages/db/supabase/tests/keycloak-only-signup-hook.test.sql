-- before-user-created hook from 20261012135828_keycloak_only_signup_hook —
-- runs via `supabase test db`.
--
-- Pins:
--   * a Keycloak signup is allowed (empty object, no error key);
--   * Google, email and a missing provider are refused with a 403 error;
--   * only supabase_auth_admin can execute it — not PUBLIC, anon,
--     authenticated or service_role.

begin;
create extension if not exists pgtap with schema public;

select plan(10);

create function pg_temp.event(provider text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object(
      'email', 'someone@example.com',
      'app_metadata', case
        when provider is null then '{}'::jsonb
        else jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider))
      end
    )
  )
$$;

select is(
  public.hook_before_user_created(pg_temp.event('keycloak')),
  '{}'::jsonb,
  'a Keycloak signup is allowed'
);

select is(
  (public.hook_before_user_created(pg_temp.event(p))->'error'->>'http_code')::int,
  403,
  'a ' || coalesce(p, 'provider-less') || ' signup is refused'
)
from unnest(array['google', 'email', null]) p;

select ok(
  public.hook_before_user_created(pg_temp.event('google'))->'error'->>'message' like '%Keycloak%',
  'the refusal tells the member to use Keycloak'
);

select ok(
  not has_function_privilege(r, 'public.hook_before_user_created(jsonb)', 'EXECUTE'),
  r || ' cannot execute the hook'
)
from unnest(array['anon', 'authenticated', 'service_role']) r;

select ok(
  not exists (
    select 1
      from aclexplode((select proacl from pg_proc
                        where oid = 'public.hook_before_user_created(jsonb)'::regprocedure)) a
     where a.grantee = 0
  ),
  'PUBLIC holds no EXECUTE on the hook'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'EXECUTE'),
  'supabase_auth_admin can execute the hook'
);

select * from finish();
rollback;
