-- Keycloak sends a member's name as "<given> <family>", so a Chinese name
-- lands in user_profiles.name as "詠翔 詹". Put the family name first
-- ("詹詠翔") when the whole name is exactly two runs of Han characters joined by
-- one space; every other name is stored as before. The door display applies
-- the same rule in apps/portal/lib/door/display.ts. The character class spans
-- CJK Unified Ideographs, Extension A, the compatibility block and the
-- supplementary ideographic planes.
--
-- Only the name expression changes; the rest is 20260728084157 verbatim.

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
    regexp_replace(
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      '^([㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]+) ([㐀-䶿一-鿿豈-﫿\U00020000-\U0003ffff]+)$',
      '\2\1'
    ),
    NEW.raw_user_meta_data->'custom_claims'->>'preferred_username'
  );
  RETURN NEW;
END;
$function$;
