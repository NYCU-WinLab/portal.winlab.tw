-- add_bento_order_item: actually close the anon write path 20260810015044 said
-- it was closing.
--
-- That migration's section 4 states the goal plainly — "an anon caller could
-- inject order items into active orders", so "anon does not need EXECUTE" — and
-- implements it as:
--
--   revoke execute on function public.add_bento_order_item(...) from anon;
--
-- which removes anon's DIRECT grant only. PostgreSQL grants EXECUTE to PUBLIC
-- on every new function by default, and anon is a member of PUBLIC, so anon
-- kept the privilege the whole time. Measured on prod 2026-09-17:
--
--   add_bento_order_item -> {-, authenticated, postgres, service_role}
--
-- `-` is PUBLIC (aclexplode reports grantee 0; 0::regrole::text prints '-').
-- The lockdown has not been holding since it shipped on 2026-08-10.
--
-- This one matters more than the same slip on copy_bento_order_from_user
-- (fixed in 20260917122038): that function rejects a null auth.uid() on its
-- first line, so anon got an exception. add_bento_order_item has a live
-- anonymous branch — `if v_uid is null then ... insert ... anonymous_name` —
-- which is exactly the injection the lockdown named. It is SECURITY DEFINER,
-- so it runs as owner and RLS never gets a say.
--
-- Safe to revoke — no legitimate anon caller exists:
--   * the only caller in the codebase is hooks/bento/use-order-items.ts, a
--     "use client" hook, so the call always originates in a browser;
--   * there is no bento route handler, so nothing reaches it through /api
--     (the one path proxy.ts leaves ungated);
--   * proxy.ts gates everything except /api, /login and /auth/*, so a browser
--     that reaches the add-item dialog is always authenticated. The dialog's
--     `isAnonymous = !user` branch is unreachable in practice, which is the
--     same conclusion 20260810015044 reached when it decided anon was unused.
--
-- A scan of every SECURITY DEFINER function in public found this is the only
-- one matching the broken-intent shape (PUBLIC holds EXECUTE, but a direct anon
-- grant was revoked). The other 27 that still grant PUBLIC never had a revoke
-- attempted against them — nobody has decided anything about those, so they are
-- deliberately left alone here rather than swept up in a bento fix.

revoke execute on function public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text)
  from public;

-- Re-assert the intended grantees. Both already hold it; naming them keeps this
-- file readable alone and correct on a replay from scratch.
grant execute on function public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text)
  to authenticated, service_role;
