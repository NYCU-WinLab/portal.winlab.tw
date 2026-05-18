-- Tighten access to submit_game_score: explicitly revoke EXECUTE from anon.
--
-- Why: Supabase's default privileges on the public schema auto-grant EXECUTE
-- on new functions to anon as well as authenticated, so the prior
-- `revoke all from public; grant execute to authenticated` did not restrict
-- anon. The function still rejects anon callers via the internal
-- `if auth.uid() is null then raise 'not authenticated'` check, so this is
-- defense-in-depth, not a vulnerability fix — but the GRANT structure
-- should match the migration's stated intent.

revoke execute on function public.submit_game_score(
  public.game_type, integer, integer, smallint
) from anon;
