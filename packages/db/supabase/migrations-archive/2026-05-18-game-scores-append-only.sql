-- Lock down game_scores as append-only.
-- Existing migrations grant SELECT + INSERT to authenticated.
-- Postgres RLS denies UPDATE/DELETE by default when no policy matches, but
-- restrictive policies make the intent explicit and survive future drift
-- (e.g. an accidental permissive UPDATE policy added later cannot escalate).

create policy "game_scores deny update"
  on public.game_scores
  as restrictive
  for update
  to authenticated, anon
  using (false)
  with check (false);

create policy "game_scores deny delete"
  on public.game_scores
  as restrictive
  for delete
  to authenticated, anon
  using (false);
