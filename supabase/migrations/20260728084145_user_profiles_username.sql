-- The Keycloak account name (OIDC `preferred_username`, e.g. "n0ball").
-- It arrives in auth.users.raw_user_meta_data, which PostgREST doesn't
-- expose, so anything client-side that wants to show or search by account
-- name had no way to reach it — the rooms attendee picker was approximating
-- it with the email local part, which is wrong for anyone whose email isn't
-- <account>@<somewhere> (e.g. winlab@n0ball.tw -> "winlab", account n0ball).

alter table public.user_profiles
  add column if not exists username text;

update public.user_profiles p
set username = u.raw_user_meta_data->'custom_claims'->>'preferred_username'
from auth.users u
where u.id = p.id
  and p.username is null
  and u.raw_user_meta_data->'custom_claims' ? 'preferred_username';

-- user_profiles is column-granted (see the 20260724 anon lockdown), so a new
-- column is invisible until named explicitly. anon deliberately stays on
-- id/name only.
grant select (username) on public.user_profiles to authenticated;
