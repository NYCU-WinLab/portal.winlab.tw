-- Private bucket for approve-app PDFs. Idempotent.
insert into storage.buckets (id, name, public)
values ('approve-documents', 'approve-documents', false)
on conflict (id) do nothing;

-- Allow the document creator to upload objects under {doc_id}/...
create policy "approve_documents_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and d.created_by = auth.uid()
  )
);

-- Allow creator + signers to read
create policy "approve_documents_storage_select"
on storage.objects for select
using (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and (
        d.created_by = auth.uid()
        or exists (
          select 1 from public.approve_signers s
          where s.document_id = d.id and s.signer_id = auth.uid()
        )
      )
  )
);

-- Allow creator to delete (used when re-uploading pdf inside a draft)
create policy "approve_documents_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and d.created_by = auth.uid()
  )
);
