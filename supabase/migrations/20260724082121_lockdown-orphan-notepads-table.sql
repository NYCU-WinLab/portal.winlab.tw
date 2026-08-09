-- notepads has zero references anywhere in apps/ (grep across the whole repo
-- turns up nothing except the generated database.types.ts) — it is not used
-- by any current portal.winlab.tw feature. Its RLS policies were wide open
-- (SELECT/INSERT/UPDATE all `USING/WITH CHECK (true)`) with anon also holding
-- full table grants, so anyone on the internet could read/write it with no
-- login at all. Row content shows it has actually been found and abused as an
-- anonymous pastebin (arbitrary slugs as ids, token-shaped strings as content).
--
-- Locking down immediately: revoke anon entirely, and tighten the RLS
-- policies to require a real signed-in portal user (matching this repo's
-- baseline pattern elsewhere) rather than leaving them open. Not dropping the
-- table itself — that's a bigger call for a human, and this fix alone stops
-- the live exposure.

revoke all on public.notepads from anon;

drop policy if exists "Anyone can read notepads" on public.notepads;
drop policy if exists "Anyone can insert notepads" on public.notepads;
drop policy if exists "Anyone can update notepads" on public.notepads;

create policy notepads_select on public.notepads
  for select to public
  using (auth.uid() is not null);

create policy notepads_insert on public.notepads
  for insert to public
  with check (auth.uid() is not null);

create policy notepads_update on public.notepads
  for update to public
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
