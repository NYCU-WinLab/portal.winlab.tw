-- Narrow the helper-based RLS policies to `authenticated` and tighten the
-- helpers' EXECUTE grants. Follow-up to 20260924050258_tighten_function_grants.
--
-- has_role / approve_doc_status / approve_is_creator / approve_is_signer are
-- SECURITY DEFINER helpers called from RLS policies that were declared
-- `to public` (or with no TO clause, which means the same). A policy
-- expression is evaluated with the querying role's EXECUTE privilege, so the
-- helpers had to stay executable by anon for as long as those policies also
-- applied to anon.
--
-- Every one of those policies is false for a request with no signed-in user:
-- each predicate needs auth.uid() to equal a column, or passes auth.uid() to
-- a helper that returns false for NULL (has_role finds no profile row;
-- approve_is_creator / approve_is_signer find no matching row; approve_doc_
-- status is only ever ANDed with approve_is_creator). So restricting them to
-- `authenticated` changes nothing a visitor without a session could do, and
-- once no policy that applies to anon calls the helpers, anon's EXECUTE can
-- go.
--
-- Where anon still reads a table legitimately, it does so through a separate
-- policy that calls none of the helpers, and those are untouched:
--   bento_option_groups  "Anyone can view option groups"  (select, true)
--   bento_option_values  "Anyone can view option values"  (select, true)
--   storage.objects      bento_menus_storage_select       (select, bucket only)
-- bento_order_items carries no anon table grant at all since 20260810015044.
--
-- `alter policy … to` changes only the role list; command, permissiveness and
-- the using / with check expressions are kept as they are.

-- 1. approve_documents ─────────────────────────────────────────────────────
alter policy approve_documents_select on public.approve_documents
  to authenticated;

-- 2. approve_fields ────────────────────────────────────────────────────────
alter policy approve_fields_select on public.approve_fields to authenticated;
alter policy approve_fields_insert on public.approve_fields to authenticated;
alter policy approve_fields_update on public.approve_fields to authenticated;
alter policy approve_fields_delete on public.approve_fields to authenticated;

-- 3. approve_signers ───────────────────────────────────────────────────────
alter policy approve_signers_select on public.approve_signers to authenticated;
alter policy approve_signers_insert on public.approve_signers to authenticated;
alter policy approve_signers_update on public.approve_signers to authenticated;
alter policy approve_signers_delete on public.approve_signers to authenticated;

-- 4. bento_order_items ─────────────────────────────────────────────────────
alter policy "Admins can delete any order items" on public.bento_order_items
  to authenticated;
alter policy "Admins can insert order items for any user"
  on public.bento_order_items to authenticated;

-- 5. bento option tables (for all) ─────────────────────────────────────────
alter policy "Admins can manage option groups" on public.bento_option_groups
  to authenticated;
alter policy "Admins can manage option values" on public.bento_option_values
  to authenticated;

-- 6. storage.objects, bento-menus bucket writes ────────────────────────────
alter policy bento_menus_storage_insert on storage.objects to authenticated;
alter policy bento_menus_storage_update on storage.objects to authenticated;
alter policy bento_menus_storage_delete on storage.objects to authenticated;

-- 7. storage.objects, approve-documents bucket ─────────────────────────────
-- These three were created outside the replayed migration history (see
-- migrations-archive/2026-04-23-approve-rls-fix.sql), so a fresh local stack
-- does not have them but a long-lived database may. Narrow them when present.
do $$
declare
  p text;
begin
  foreach p in array array[
    'approve_documents_storage_select',
    'approve_documents_storage_insert',
    'approve_documents_storage_delete'
  ] loop
    if exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = p
    ) then
      execute format('alter policy %I on storage.objects to authenticated', p);
    end if;
  end loop;
end $$;

-- 8. Guard: nothing that still applies to anon may call the helpers ────────
-- Revoking EXECUTE below while such a policy exists would turn an empty
-- result into a permission error for every anon query on that table. Fail
-- the migration instead, so the offending policy gets handled first.
do $$
declare
  leftover text;
begin
  select string_agg(format('%I.%I %I', schemaname, tablename, policyname), ', ')
    into leftover
    from pg_policies
   where roles && array['public', 'anon']::name[]
     and coalesce(qual, '') || ' ' || coalesce(with_check, '')
         ~ '\m(has_role|approve_doc_status|approve_is_creator|approve_is_signer)\s*\(';

  if leftover is not null then
    raise exception 'policies still applying to anon call the RLS helpers: %',
      leftover;
  end if;
end $$;

-- 9. Helper grants ─────────────────────────────────────────────────────────
revoke execute on function public.has_role(uuid, text, text)       from public, anon;
revoke execute on function public.approve_doc_status(uuid)         from public, anon;
revoke execute on function public.approve_is_creator(uuid, uuid)   from public, anon;
revoke execute on function public.approve_is_signer(uuid, uuid)    from public, anon;

grant execute on function public.has_role(uuid, text, text)       to authenticated, service_role;
grant execute on function public.approve_doc_status(uuid)         to authenticated, service_role;
grant execute on function public.approve_is_creator(uuid, uuid)   to authenticated, service_role;
grant execute on function public.approve_is_signer(uuid, uuid)    to authenticated, service_role;
