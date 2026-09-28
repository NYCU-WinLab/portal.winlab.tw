-- upsert_user_profile(text, text) has had no callers since the baseline; user_profiles is
-- written by handle_new_user() and the auth.users sync trigger. Drop the dead function.
drop function if exists public.upsert_user_profile(text, text);
