-- Keep user_profiles.username in step with Keycloak. handle_new_user covers
-- first sign-in; the UPDATE trigger covers the case where someone's Keycloak
-- account name changes later, which would otherwise leave a stale value
-- sitting in the picker forever with nothing to reveal it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->'custom_claims'->>'preferred_username'
  );
  RETURN NEW;
END;
$function$;

create or replace function public.sync_user_profile_username()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  UPDATE public.user_profiles
  SET username = NEW.raw_user_meta_data->'custom_claims'->>'preferred_username'
  WHERE id = NEW.id
    AND username IS DISTINCT FROM
        NEW.raw_user_meta_data->'custom_claims'->>'preferred_username';
  RETURN NEW;
END;
$function$;

drop trigger if exists on_auth_user_username_sync on auth.users;
create trigger on_auth_user_username_sync
  after update of raw_user_meta_data on auth.users
  for each row
  execute function public.sync_user_profile_username();
