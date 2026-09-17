-- copy_bento_order_from_user: revoke PUBLIC, not just anon (follow-up to #1131).
--
-- 20260917115311 ended with `revoke execute ... from anon`, copying the shape
-- of the anon lockdown in 20260810015044. That removes anon's DIRECT grant and
-- nothing else — and PostgreSQL grants EXECUTE to PUBLIC on every new function
-- by default, so anon kept the privilege through PUBLIC anyway. Live check on
-- prod right after applying it:
--
--   copy_bento_order_from_user -> {-, authenticated, postgres, service_role}
--
-- where `-` is PUBLIC (aclexplode reports grantee 0, and 0::regrole::text is
-- '-'). Contrast meetings_rebalance_questioners_exec, which revoked from PUBLIC
-- and reads {postgres}.
--
-- Nothing was actually reachable: the function's first statement rejects a null
-- auth.uid() with '請先登入', so an anon caller got an exception rather than a
-- copy. This is about the ACL matching its stated intent, and about the pgTAP
-- assertion that claimed to prove it — that assertion only looked for a direct
-- anon grantee, so it passed against an ACL that still handed anon the
-- privilege. It is widened in the same commit.
--
-- NOT fixed here: add_bento_order_item carries the identical PUBLIC grant, and
-- unlike this function it has a live anonymous insert branch, so 20260810015044
-- section 4 ("close the anon *write* path") is not currently holding. That is a
-- pre-existing hole in someone else's migration with its own blast radius, and
-- it gets its own issue rather than riding along in a copy-order follow-up.

revoke execute on function public.copy_bento_order_from_user(text, uuid) from public;

-- Re-assert the intended grantees. Both are already present; stating them here
-- keeps this file readable on its own and survives a replay from scratch.
grant execute on function public.copy_bento_order_from_user(text, uuid)
  to authenticated, service_role;
