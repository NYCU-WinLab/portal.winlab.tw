-- RLS cross-reference recursion fix for approve_* tables.
--
-- The original policies had approve_documents.SELECT look at approve_signers
-- (and vice versa), triggering PostgreSQL's "infinite recursion detected"
-- error on any insert / select. Breaking the cycle with SECURITY DEFINER
-- helpers that bypass RLS on their own lookups.

create or replace function public.approve_is_creator(doc_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.approve_documents where id = doc_id and created_by = uid
  )
$$;

create or replace function public.approve_is_signer(doc_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.approve_signers where document_id = doc_id and signer_id = uid
  )
$$;

create or replace function public.approve_doc_status(doc_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select status from public.approve_documents where id = doc_id
$$;

revoke execute on function public.approve_is_creator(uuid, uuid) from public;
revoke execute on function public.approve_is_signer(uuid, uuid) from public;
revoke execute on function public.approve_doc_status(uuid) from public;
grant execute on function public.approve_is_creator(uuid, uuid) to authenticated;
grant execute on function public.approve_is_signer(uuid, uuid) to authenticated;
grant execute on function public.approve_doc_status(uuid) to authenticated;

-- approve_documents
drop policy if exists "approve_documents_select" on public.approve_documents;
create policy "approve_documents_select"
on public.approve_documents for select
using (
  created_by = auth.uid()
  or public.approve_is_signer(id, auth.uid())
);

-- approve_signers
drop policy if exists "approve_signers_select" on public.approve_signers;
create policy "approve_signers_select"
on public.approve_signers for select
using (
  signer_id = auth.uid()
  or public.approve_is_creator(document_id, auth.uid())
);

drop policy if exists "approve_signers_insert" on public.approve_signers;
create policy "approve_signers_insert"
on public.approve_signers for insert
with check (public.approve_is_creator(document_id, auth.uid()));

drop policy if exists "approve_signers_delete" on public.approve_signers;
create policy "approve_signers_delete"
on public.approve_signers for delete
using (
  public.approve_is_creator(document_id, auth.uid())
  and public.approve_doc_status(document_id) in ('draft','pending')
);

-- approve_fields
drop policy if exists "approve_fields_select" on public.approve_fields;
create policy "approve_fields_select"
on public.approve_fields for select
using (
  signer_id = auth.uid()
  or public.approve_is_creator(document_id, auth.uid())
);

drop policy if exists "approve_fields_insert" on public.approve_fields;
create policy "approve_fields_insert"
on public.approve_fields for insert
with check (
  public.approve_is_creator(document_id, auth.uid())
  and public.approve_doc_status(document_id) = 'draft'
);

drop policy if exists "approve_fields_update" on public.approve_fields;
create policy "approve_fields_update"
on public.approve_fields for update
using (
  signer_id = auth.uid()
  or (
    public.approve_is_creator(document_id, auth.uid())
    and public.approve_doc_status(document_id) = 'draft'
  )
)
with check (
  signer_id = auth.uid()
  or (
    public.approve_is_creator(document_id, auth.uid())
    and public.approve_doc_status(document_id) = 'draft'
  )
);

drop policy if exists "approve_fields_delete" on public.approve_fields;
create policy "approve_fields_delete"
on public.approve_fields for delete
using (
  public.approve_is_creator(document_id, auth.uid())
  and public.approve_doc_status(document_id) = 'draft'
);

-- Storage policies (same cross-reference issue)
drop policy if exists "approve_documents_storage_select" on storage.objects;
create policy "approve_documents_storage_select"
on storage.objects for select
using (
  bucket_id = 'approve-documents'
  and (
    public.approve_is_creator(((storage.foldername(name))[1])::uuid, auth.uid())
    or public.approve_is_signer(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

drop policy if exists "approve_documents_storage_insert" on storage.objects;
create policy "approve_documents_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'approve-documents'
  and public.approve_is_creator(((storage.foldername(name))[1])::uuid, auth.uid())
);

drop policy if exists "approve_documents_storage_delete" on storage.objects;
create policy "approve_documents_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'approve-documents'
  and public.approve_is_creator(((storage.foldername(name))[1])::uuid, auth.uid())
);
