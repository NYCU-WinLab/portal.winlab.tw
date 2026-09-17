-- add_bento_order_item ACL regression suite — runs via `supabase test db`.
--
-- 20260810015044 section 4 set out to stop anon injecting rows into active
-- orders, and wrote `revoke execute ... from anon`. That removes anon's DIRECT
-- grant and leaves PostgreSQL's default grant to PUBLIC in place, which anon
-- inherits — so the lockdown did nothing from 2026-08-10 until 20260917124630
-- fixed it. Nothing caught that, because nothing asserted it.
--
-- This file is the assertion that would have. It matters more for this function
-- than for most: it is SECURITY DEFINER (so it runs as owner and RLS never gets
-- a say) AND it has a live anonymous insert branch, which is precisely the
-- injection path the lockdown named.
--
-- Read the ACL off pg_proc rather than trying to prove a revoke by attempting a
-- call: this project's `alter default privileges` hands anon/authenticated/
-- service_role EXECUTE on every new function in public, so a bare
-- `revoke ... from public` never removes what a role already holds directly,
-- and the reverse — revoking a role while PUBLIC still grants it — is the slip
-- this file exists to catch (#1104, #1167).
--
-- Assert the WHOLE grantee set, not the absence of one name. A check written as
-- `grantee::regrole::text = 'anon'` walks straight past PUBLIC, which aclexplode
-- reports as grantee 0 and ::regrole::text prints as '-'. That is exactly how
-- the first version of the copy-order assertion went green against an ACL that
-- still handed anon the privilege.

begin;
create extension if not exists pgtap with schema public;

select plan(2);

-- Both assertions run BEFORE the suite-wide blanket grant at the bottom of this
-- file. That grant does not merely get tested against — it MUTATES proacl, so
-- the ACL has to be captured exactly as the migrations left it. (It only ever
-- adds `authenticated`, which is expected here anyway, but the ordering is the
-- habit that keeps this kind of file honest.)
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
     from aclexplode((select proacl from pg_proc
                      where oid = 'public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text)'::regprocedure)) a
    where a.privilege_type = 'EXECUTE'),
  array['authenticated', 'postgres', 'service_role'],
  'add_bento_order_item is executable by authenticated + service_role only — not anon, and not PUBLIC'
);

-- The ACL above is the only thing standing in front of this function, and that
-- is true *because* it is SECURITY DEFINER: it runs as its owner, so RLS on
-- bento_order_items never applies to what it inserts. If someone ever makes it
-- SECURITY INVOKER the assertion above stops being the whole story, and this
-- assertion is what says so out loud.
select ok(
  (select prosecdef from pg_proc
    where oid = 'public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text)'::regprocedure),
  'add_bento_order_item is still SECURITY DEFINER — which is why its ACL is the whole defence'
);

-- Suite-wide convention: every pgTAP file in this repo ends up granting this so
-- the rest of the suite stays runnable after dropping to `authenticated`.
-- Nothing above needs it, so it runs last.
grant execute on all functions in schema public to authenticated;

select * from finish();
rollback;
