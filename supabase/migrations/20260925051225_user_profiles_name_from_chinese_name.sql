-- user_profiles.name comes from Keycloak's chinese_name (#415).
--
-- Keycloak sends a `chinese_name` attribute, family name first (何承運), as a
-- token claim. Supabase files it under raw_user_meta_data->'custom_claims'
-- next to preferred_username, and rewrites raw_user_meta_data on every
-- Keycloak sign-in. The top-level OIDC `name` is "<given> <family>" and is
-- never the same string, which is why #1218 (20260923050000) had to reorder
-- it. That reorder stays, but only as a fallback for members whose token
-- carries no chinese_name: sign-ins from before the mapper existed, and the
-- occasional account with the attribute left empty.
--
-- Until now name and email were written once, at signup, and never again, so
-- a rename in Keycloak never reached the portal. The username sync trigger
-- from 20260728084157 already runs on every metadata rewrite; it now carries
-- name and email too.
--
-- Nothing else writes user_profiles.name: the web app stopped editing names
-- in #417, and the only BEFORE UPDATE guard on the table
-- (prevent_role_escalation) pins roles, is_admin and lab_status, not name or
-- email.

-- ── 1. one rule for a member's display name ────────────────────────────────
-- First match wins:
--   1. custom_claims.chinese_name, trimmed, if not empty
--   2. the OIDC name, family first, when it is exactly two runs of Han
--      characters joined by one space (#1218's regexp, moved here verbatim)
--   3. the OIDC name, trimmed, if not empty
--   4. the email
-- Pure: no table reads, so it is immutable and needs no SECURITY DEFINER.
create or replace function public.member_display_name(meta jsonb, email text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(
    nullif(trim(meta->'custom_claims'->>'chinese_name'), ''),
    -- The ranges are \u escapes on purpose: NFC normalisation rewrites a
    -- literal compatibility ideograph (U+F900 -> U+8C48) and widens the range.
    case
      when meta->>'name' ~ '^([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]+) ([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]+)$'
      then regexp_replace(
        meta->>'name',
        '^([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]+) ([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\U00020000-\U0003FFFF]+)$',
        '\2\1'
      )
    end,
    nullif(trim(meta->>'name'), ''),
    email
  )
$function$;

-- Only the two trigger functions below call it, and they run as the owner.
-- Named roles, not just PUBLIC: this project's `alter default privileges`
-- hands anon/authenticated/service_role EXECUTE on every new function, so a
-- bare `revoke ... from public` would leave those direct grants in place.
revoke execute on function public.member_display_name(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.member_display_name(jsonb, text)
  to service_role;

-- ── 2. signup ──────────────────────────────────────────────────────────────
-- The name expression changes and the search_path is now pinned; the rest is
-- 20260923050000 verbatim. It is SECURITY DEFINER and had no search_path of
-- its own, so it resolved names through whatever the caller had set. Every
-- reference below is schema-qualified, which is what makes '' safe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, name, username)
  VALUES (
    NEW.id,
    NEW.email,
    public.member_display_name(NEW.raw_user_meta_data, NEW.email),
    NEW.raw_user_meta_data->'custom_claims'->>'preferred_username'
  );
  RETURN NEW;
END;
$function$;

-- ── 3. every later sign-in or email change ─────────────────────────────────
-- The username logic is 20260728084157's, unchanged. The WHERE clause keeps
-- the common case (a sign-in that changes nothing) from writing the row at
-- all; when it does write, each column is set to the value it already holds
-- unless that value moved.
create or replace function public.sync_user_profile_username()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_username text := NEW.raw_user_meta_data->'custom_claims'->>'preferred_username';
  v_name     text := public.member_display_name(NEW.raw_user_meta_data, NEW.email);
BEGIN
  UPDATE public.user_profiles
  SET username = v_username,
      name     = v_name,
      email    = NEW.email
  WHERE id = NEW.id
    AND (username IS DISTINCT FROM v_username
         OR name  IS DISTINCT FROM v_name
         OR email IS DISTINCT FROM NEW.email);
  RETURN NEW;
END;
$function$;

-- The trigger fired only on raw_user_meta_data; an email change touches the
-- email column alone, so add it to the column list.
drop trigger if exists on_auth_user_username_sync on auth.users;
create trigger on_auth_user_username_sync
  after update of raw_user_meta_data, email on auth.users
  for each row
  execute function public.sync_user_profile_username();

-- ── 4. backfill ────────────────────────────────────────────────────────────
-- Names only for members whose metadata already carries a chinese_name; the
-- rest keep what they have until their next sign-in runs the trigger. Emails
-- for everyone whose copy has drifted.
update public.user_profiles p
set name  = case
              when nullif(trim(u.raw_user_meta_data->'custom_claims'->>'chinese_name'), '') is not null
              then public.member_display_name(u.raw_user_meta_data, u.email)
              else p.name
            end,
    email = u.email
from auth.users u
where u.id = p.id
  and (
    (nullif(trim(u.raw_user_meta_data->'custom_claims'->>'chinese_name'), '') is not null
     and p.name is distinct from public.member_display_name(u.raw_user_meta_data, u.email))
    or p.email is distinct from u.email
  );
