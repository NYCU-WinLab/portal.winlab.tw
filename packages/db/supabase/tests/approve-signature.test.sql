begin;
create extension if not exists pgtap with schema public;
grant execute on all functions in schema public to authenticated;

select plan(5);

insert into auth.users (id) values
  ('a1111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222');

insert into public.user_profiles (id, email, is_admin, roles) values
  ('a1111111-1111-1111-1111-111111111111', 'signer@test.local', false, '{}'),
  ('a2222222-2222-2222-2222-222222222222', 'creator@test.local', false, '{}');

insert into public.approve_documents (id, title, file_path, status, created_by)
values (
  'a3333333-3333-3333-3333-333333333333',
  'Repeated signatures',
  'a3333333-3333-3333-3333-333333333333/original.pdf',
  'pending',
  'a2222222-2222-2222-2222-222222222222'
);

insert into public.approve_signers (document_id, signer_id)
values (
  'a3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111'
);

insert into public.approve_fields (
  id,
  document_id,
  signer_id,
  page,
  x,
  y,
  width,
  height,
  category,
  created_at
) values
  (
    'a4444444-4444-4444-4444-444444444441',
    'a3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    1, 0.1, 0.1, 0.2, 0.1, 'signature', '2026-01-01T00:00:00Z'
  ),
  (
    'a4444444-4444-4444-4444-444444444442',
    'a3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    1, 0.1, 0.2, 0.2, 0.1, 'signature', '2026-01-02T00:00:00Z'
  ),
  (
    'a4444444-4444-4444-4444-444444444443',
    'a3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    1, 0.1, 0.3, 0.2, 0.1, 'signature', '2026-01-03T00:00:00Z'
  ),
  (
    'a4444444-4444-4444-4444-444444444444',
    'a3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    1, 0.1, 0.4, 0.2, 0.1, 'signature', '2026-01-04T00:00:00Z'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.approve_submit_signature(
       'a3333333-3333-3333-3333-333333333333',
       '[
         {"fieldId":"a4444444-4444-4444-4444-444444444441","value":"signature-1"},
         {"fieldId":"a4444444-4444-4444-4444-444444444442","value":"signature-2"},
         {"fieldId":"a4444444-4444-4444-4444-444444444443","value":"signature-3"},
         {"fieldId":"a4444444-4444-4444-4444-444444444444","value":"signature-4"}
       ]'::jsonb
     ) $$,
  'a signer can submit repeated predefined field categories'
);

select is(
  (
    select count(*)
    from public.approve_fields
    where document_id = 'a3333333-3333-3333-3333-333333333333'
      and value is not null
      and signed_at is not null
  ),
  4::bigint,
  'every repeated signature field is signed'
);

select is(
  (
    select value
    from public.approve_user_field_values
    where user_id = 'a1111111-1111-1111-1111-111111111111'
      and category = 'signature'
  ),
  'signature-4',
  'the latest field becomes the saved value for that category'
);

select is(
  (
    select status
    from public.approve_signers
    where document_id = 'a3333333-3333-3333-3333-333333333333'
      and signer_id = 'a1111111-1111-1111-1111-111111111111'
  ),
  'signed',
  'the signer is marked signed'
);

select is(
  (
    select status
    from public.approve_documents
    where id = 'a3333333-3333-3333-3333-333333333333'
  ),
  'completed',
  'the document completes after its last signer signs'
);

select * from finish();
rollback;

