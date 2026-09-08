-- Lock down anonymous (not-logged-in) access to bento order data.
--
-- Problem (advisory GHSA-gch6-8ggw-xjx9): the baseline shipped both bento order
-- tables with a `for select to public using (true)` policy plus a blanket grant
-- to the `anon` role, so anyone holding the public publishable key could read
-- (and, via the grants, was privileged to write) every order and order item
-- without logging in. Verified live: `anon` could read 31 `bento_orders` and 775
-- `bento_order_items` rows, and `user_id` joins to `user_profiles(id, name)`
-- which anon can also read, so an unauthenticated caller could reconstruct
-- "member <name> ordered on <date>" for the whole lab.
--
-- Fix: `/bento` is entirely behind the portal auth gate (proxy.ts allow-lists
-- only /login and /auth/*), the app talks to Supabase as `authenticated`, direct
-- inserts run as `authenticated`, and add_bento_order_item() is SECURITY DEFINER.
-- The `anon` role is therefore never used by this feature — revoke it and scope
-- reads to `authenticated`. Authenticated policies/grants are left untouched.

-- 1. bento_orders: SELECT for authenticated members only (was: to public / using(true)).
drop policy if exists "Anyone can view orders" on public.bento_orders;
create policy "Authenticated can view orders"
  on public.bento_orders
  for select
  to authenticated
  using (true);

-- 2. bento_order_items: SELECT for authenticated members only.
drop policy if exists "Anyone can view order items" on public.bento_order_items;
create policy "Authenticated can view order items"
  on public.bento_order_items
  for select
  to authenticated
  using (true);

-- 3. Strip the over-broad anon table grants (baseline granted anon
--    SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER). This is what
--    actually stops the anon key from reading these tables. Authenticated grants
--    are unaffected; the SECURITY DEFINER add_bento_order_item() runs as its
--    owner, so guest-on-behalf ordering by a logged-in user still works.
revoke all privileges on public.bento_orders      from anon;
revoke all privileges on public.bento_order_items from anon;

-- 4. Close the anon *write* path too (advisory notes the tables were "writable by
--    anon"): add_bento_order_item() is SECURITY DEFINER and was granted to anon,
--    so an anon caller could inject order items into active orders. /bento is
--    auth-gated and this RPC is only ever called by authenticated users, so anon
--    does not need EXECUTE. Keep authenticated + service_role.
revoke execute on function public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text) from anon;

-- 5. bento_ratings — same anti-pattern (PR-review #833). `"Anyone can view ratings"`
--    is `to public using (true)` with a blanket anon grant, so anon can read every
--    rating (user_id + score), joinable to names via the anon-readable
--    user_profiles(id, name). Live-verified anon-readable (HTTP 200; 0 rows today,
--    so latent, not yet leaking). The app never reads this table as anon (/bento is
--    auth-gated). Scope SELECT to authenticated; the own-row insert/update/delete
--    policies are unaffected. Revoke the over-broad anon grant.
drop policy if exists "Anyone can view ratings" on public.bento_ratings;
create policy "Authenticated can view ratings"
  on public.bento_ratings
  for select
  to authenticated
  using (true);
revoke all privileges on public.bento_ratings from anon;

-- 6. SECURITY DEFINER views bento_order_stats / bento_user_rankings (PR-review #833).
--    The baseline grants anon SELECT on both (they run as owner and bypass RLS, so
--    they would re-expose member name + spending). Live check 2026-08-10: both are
--    404 / not in the PostgREST schema cache on prod — NOT a current leak (dropped
--    or unexposed since the baseline snapshot). Revoke defensively, guarded by
--    to_regclass so this is a no-op if the view no longer exists (won't fail replay).
do $$
begin
  if to_regclass('public.bento_order_stats') is not null then
    execute 'revoke all privileges on public.bento_order_stats from anon';
  end if;
  if to_regclass('public.bento_user_rankings') is not null then
    execute 'revoke all privileges on public.bento_user_rankings from anon';
  end if;
end $$;

-- Deliberately NOT changed (PR-review #833 triage): bento_menus, bento_menu_items,
-- and the bento_option_* tables remain anon-grantable. They hold menu content, not
-- member PII; the only sensitive-ish field is restaurant phone/google_map_link on
-- bento_menus (public contact info). Left readable by design; flagged as a separate
-- low-priority decision for the bento owner rather than folded in here.
