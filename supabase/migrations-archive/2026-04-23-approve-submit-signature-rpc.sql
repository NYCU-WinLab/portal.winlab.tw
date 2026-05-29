-- Atomic signature submission. Wrapping the multi-statement flow in a single
-- PL/pgSQL function means a failure midway rolls the whole thing back instead
-- of leaving the document half-signed.
create or replace function public.approve_submit_signature(
  p_document_id uuid,
  p_values jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_my_id uuid;
  v_my_status text;
  v_pending_count int;
  v_now timestamptz := now();
  v_field record;
  v_val text;
begin
  if v_uid is null then
    raise exception 'Unauthenticated';
  end if;

  select id, status into v_my_id, v_my_status
  from public.approve_signers
  where document_id = p_document_id and signer_id = v_uid;

  if v_my_id is null then
    raise exception 'you are not a signer';
  end if;
  if v_my_status = 'signed' then
    raise exception 'already signed';
  end if;

  -- Validate: every field assigned to me must have a non-blank value in payload.
  for v_field in
    select id, category
    from public.approve_fields
    where document_id = p_document_id and signer_id = v_uid
  loop
    v_val := (select v->>'value' from jsonb_array_elements(p_values) v
              where (v->>'fieldId')::uuid = v_field.id);
    if v_val is null or length(btrim(v_val)) = 0 then
      raise exception 'all fields must be filled';
    end if;
  end loop;

  -- Write every field value
  for v_field in
    select id from public.approve_fields
    where document_id = p_document_id and signer_id = v_uid
  loop
    v_val := (select v->>'value' from jsonb_array_elements(p_values) v
              where (v->>'fieldId')::uuid = v_field.id);
    update public.approve_fields
      set value = v_val, signed_at = v_now
      where id = v_field.id;
  end loop;

  -- Persist predefined values for future pre-fill
  insert into public.approve_user_field_values (user_id, category, value, updated_at)
  select v_uid, f.category,
         (select v->>'value' from jsonb_array_elements(p_values) v
          where (v->>'fieldId')::uuid = f.id),
         v_now
  from public.approve_fields f
  where f.document_id = p_document_id
    and f.signer_id = v_uid
    and f.category <> 'other'
  on conflict (user_id, category) do update
    set value = excluded.value, updated_at = excluded.updated_at;

  -- Mark signer signed
  update public.approve_signers
    set status = 'signed', signed_at = v_now
    where id = v_my_id;

  -- Maybe complete document
  select count(*) into v_pending_count
  from public.approve_signers
  where document_id = p_document_id and status = 'pending';

  if v_pending_count = 0 then
    update public.approve_documents
      set status = 'completed', completed_at = v_now
      where id = p_document_id;
  end if;
end;
$$;

revoke execute on function public.approve_submit_signature(uuid, jsonb) from public;
grant execute on function public.approve_submit_signature(uuid, jsonb) to authenticated;
