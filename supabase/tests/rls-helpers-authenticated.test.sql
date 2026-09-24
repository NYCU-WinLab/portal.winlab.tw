-- RLS regression suite for 20260924092533_rls_helpers_authenticated_only
-- — runs via `supabase test db`.
--
-- Pins:
--   * the policies that call has_role / approve_doc_status /
--     approve_is_creator / approve_is_signer apply to `authenticated` only,
--     and no policy that still applies to anon (or PUBLIC) calls them.
--   * anon, which no longer holds EXECUTE on those helpers, reads the approve
--     tables as empty and the bento option tables as before, and is refused
--     writes by RLS rather than by a function permission error.
--   * signed-in creators, signers and bento admins keep the access they had;
--     other members still get nothing.
--
-- Like function-grants-acl.test.sql, this file does NOT run the suite-wide
-- `grant execute on all functions in schema public to authenticated;` — the
-- point is to exercise exactly the grants the migrations leave behind.

begin;
create extension if not exists pgtap with schema public;

select plan(41);

-- ═══ fixtures (as the superuser, RLS bypassed) ═════════════════════════════
insert into auth.users (id) values
  ('b2b2b2b2-0000-0000-0000-000000000001'), -- approve creator
  ('b2b2b2b2-0000-0000-0000-000000000002'), -- approve signer
  ('b2b2b2b2-0000-0000-0000-000000000003'), -- unrelated member
  ('b2b2b2b2-0000-0000-0000-000000000004'); -- bento admin
insert into public.user_profiles (id, email, name, is_admin, roles) values
  ('b2b2b2b2-0000-0000-0000-000000000001', 'rlsh-creator@test.local', 'Creator', false, '{}'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'rlsh-signer@test.local',  'Signer',  false, '{}'),
  ('b2b2b2b2-0000-0000-0000-000000000003', 'rlsh-member@test.local',  'Member',  false, '{}'),
  ('b2b2b2b2-0000-0000-0000-000000000004', 'rlsh-admin@test.local',   'Admin',   false,
   '{"bento": ["admin"]}');

insert into public.approve_documents (id, title, file_path, status, created_by)
values ('b2b2b2b2-0000-0000-0000-0000000000d1', 'RLS helpers',
        'b2b2b2b2-0000-0000-0000-0000000000d1/original.pdf', 'draft',
        'b2b2b2b2-0000-0000-0000-000000000001');
insert into public.approve_signers (document_id, signer_id)
values ('b2b2b2b2-0000-0000-0000-0000000000d1',
        'b2b2b2b2-0000-0000-0000-000000000002');
insert into public.approve_fields
  (id, document_id, signer_id, page, x, y, width, height, category)
values ('b2b2b2b2-0000-0000-0000-0000000000f1',
        'b2b2b2b2-0000-0000-0000-0000000000d1',
        'b2b2b2b2-0000-0000-0000-000000000002',
        1, 0.1, 0.1, 0.2, 0.1, 'signature');

insert into public.bento_menus (id, name, phone, kind) values
  ('b2b2b2b2-0000-0000-0000-0000000000a1', 'RLS 飲料店', '03', 'drinks');
insert into public.bento_menu_items (id, restaurant_id, name, price) values
  ('b2b2b2b2-0000-0000-0000-0000000000a2', 'b2b2b2b2-0000-0000-0000-0000000000a1', '紅茶', 35);
insert into public.bento_option_groups
  (id, restaurant_id, name, required, single_select, sort_order)
values ('b2b2b2b2-0000-0000-0000-0000000000a3',
        'b2b2b2b2-0000-0000-0000-0000000000a1', '甜度', false, true, 1);
insert into public.bento_option_values (id, group_id, label, price_delta, sort_order)
values ('b2b2b2b2-0000-0000-0000-0000000000a4',
        'b2b2b2b2-0000-0000-0000-0000000000a3', '半糖', 0, 1);
insert into public.bento_orders (id, restaurant_id, status, created_by, order_date)
values ('rlsh-order', 'b2b2b2b2-0000-0000-0000-0000000000a1', 'active',
        'b2b2b2b2-0000-0000-0000-000000000004', '2026-09-24');
insert into public.bento_order_items (id, order_id, menu_item_id, user_id, no_sauce)
values ('b2b2b2b2-0000-0000-0000-0000000000a5', 'rlsh-order',
        'b2b2b2b2-0000-0000-0000-0000000000a2',
        'b2b2b2b2-0000-0000-0000-000000000003', false);

-- ═══ 1-2. policy roles ═════════════════════════════════════════════════════
select is(
  (select array_agg(format('%s.%s', tablename, policyname) order by tablename, policyname)
     from pg_policies
    where roles = array['authenticated']::name[]
      and (schemaname, tablename, policyname) in (
        ('public', 'approve_documents',   'approve_documents_select'),
        ('public', 'approve_fields',      'approve_fields_select'),
        ('public', 'approve_fields',      'approve_fields_insert'),
        ('public', 'approve_fields',      'approve_fields_update'),
        ('public', 'approve_fields',      'approve_fields_delete'),
        ('public', 'approve_signers',     'approve_signers_select'),
        ('public', 'approve_signers',     'approve_signers_insert'),
        ('public', 'approve_signers',     'approve_signers_update'),
        ('public', 'approve_signers',     'approve_signers_delete'),
        ('public', 'bento_order_items',   'Admins can delete any order items'),
        ('public', 'bento_order_items',   'Admins can insert order items for any user'),
        ('public', 'bento_option_groups', 'Admins can manage option groups'),
        ('public', 'bento_option_values', 'Admins can manage option values'),
        ('storage', 'objects',            'bento_menus_storage_insert'),
        ('storage', 'objects',            'bento_menus_storage_update'),
        ('storage', 'objects',            'bento_menus_storage_delete')
      )),
  array[
    'approve_documents.approve_documents_select',
    'approve_fields.approve_fields_delete',
    'approve_fields.approve_fields_insert',
    'approve_fields.approve_fields_select',
    'approve_fields.approve_fields_update',
    'approve_signers.approve_signers_delete',
    'approve_signers.approve_signers_insert',
    'approve_signers.approve_signers_select',
    'approve_signers.approve_signers_update',
    'bento_option_groups.Admins can manage option groups',
    'bento_option_values.Admins can manage option values',
    'bento_order_items.Admins can delete any order items',
    'bento_order_items.Admins can insert order items for any user',
    'objects.bento_menus_storage_delete',
    'objects.bento_menus_storage_insert',
    'objects.bento_menus_storage_update'
  ],
  'every helper-based policy applies to authenticated only'
);

select is_empty(
  $$ select schemaname, tablename, policyname
       from pg_policies
      where roles && array['public', 'anon']::name[]
        and coalesce(qual, '') || ' ' || coalesce(with_check, '')
            ~ '\m(has_role|approve_doc_status|approve_is_creator|approve_is_signer)\s*\(' $$,
  'no policy that applies to anon or PUBLIC calls the RLS helpers'
);

-- ═══ 3-17. anon ════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok($$ select * from public.approve_documents $$,
  'anon can query approve_documents without an error');
select lives_ok($$ select * from public.approve_fields $$,
  'anon can query approve_fields without an error');
select lives_ok($$ select * from public.approve_signers $$,
  'anon can query approve_signers without an error');
select is((select count(*) from public.approve_documents), 0::bigint,
  'anon sees no approve_documents');
select is((select count(*) from public.approve_fields), 0::bigint,
  'anon sees no approve_fields');
select is((select count(*) from public.approve_signers), 0::bigint,
  'anon sees no approve_signers');

select lives_ok(
  $$ update public.approve_fields set page = page $$,
  'anon update on approve_fields is a silent no-op, not an error'
);
select lives_ok(
  $$ delete from public.approve_signers $$,
  'anon delete on approve_signers is a silent no-op, not an error'
);

-- The bento option tables stay readable through their own using(true)
-- policies, which call no helper.
select is(
  (select count(*) from public.bento_option_groups
    where id = 'b2b2b2b2-0000-0000-0000-0000000000a3'),
  1::bigint,
  'anon still reads bento_option_groups'
);
select is(
  (select count(*) from public.bento_option_values
    where id = 'b2b2b2b2-0000-0000-0000-0000000000a4'),
  1::bigint,
  'anon still reads bento_option_values'
);
select throws_ok(
  $$ insert into public.bento_option_groups (restaurant_id, name)
     values ('b2b2b2b2-0000-0000-0000-0000000000a1', 'anon group') $$,
  '42501',
  'new row violates row-level security policy for table "bento_option_groups"',
  'anon insert on bento_option_groups is refused by RLS'
);

-- bento_order_items: anon holds no table grant (20260810015044).
select ok(
  not has_table_privilege('anon', 'public.bento_order_items', 'select'),
  'anon holds no SELECT grant on bento_order_items'
);

select lives_ok(
  $$ select * from storage.objects where bucket_id = 'bento-menus' $$,
  'anon can query bento-menus objects without an error'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('bento-menus', 'rlsh/anon.png') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'anon upload to bento-menus is refused by RLS'
);

select throws_ok(
  $$ select public.has_role('b2b2b2b2-0000-0000-0000-000000000004', 'bento', 'admin') $$,
  '42501',
  'permission denied for function has_role',
  'anon cannot call has_role directly'
);
reset role;

-- ═══ 18-19. anon's no-op writes really did nothing ═════════════════════════
select is(
  (select count(*) from public.approve_signers
    where document_id = 'b2b2b2b2-0000-0000-0000-0000000000d1'),
  1::bigint,
  'the signer row survived the anon delete'
);
select is(
  (select count(*) from public.approve_fields
    where id = 'b2b2b2b2-0000-0000-0000-0000000000f1'),
  1::bigint,
  'the field row survived the anon update'
);

-- ═══ 20-24. the creator ════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.approve_documents), 1::bigint,
  'the creator sees their document');
select is((select count(*) from public.approve_fields), 1::bigint,
  'the creator sees the fields on their document');
select is((select count(*) from public.approve_signers), 1::bigint,
  'the creator sees the signers on their document');
select lives_ok(
  $$ insert into public.approve_fields
       (document_id, signer_id, page, x, y, width, height, category)
     values ('b2b2b2b2-0000-0000-0000-0000000000d1',
             'b2b2b2b2-0000-0000-0000-000000000002',
             1, 0.1, 0.5, 0.2, 0.1, 'signature') $$,
  'the creator can add a field to their draft'
);
select is(
  (select count(*) from public.approve_fields), 2::bigint,
  'the new field is visible to the creator'
);

-- ═══ 25-27. the signer ═════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*) from public.approve_documents), 1::bigint,
  'the signer sees the document through approve_is_signer');
select is((select count(*) from public.approve_fields), 2::bigint,
  'the signer sees their own fields');
select is((select count(*) from public.approve_signers), 1::bigint,
  'the signer sees their own signer row');

-- ═══ 28-32. an unrelated member ════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is((select count(*) from public.approve_documents), 0::bigint,
  'an unrelated member sees no approve_documents');
select is((select count(*) from public.approve_fields), 0::bigint,
  'an unrelated member sees no approve_fields');
select is((select count(*) from public.approve_signers), 0::bigint,
  'an unrelated member sees no approve_signers');
select throws_ok(
  $$ insert into public.bento_option_groups (restaurant_id, name)
     values ('b2b2b2b2-0000-0000-0000-0000000000a1', 'member group') $$,
  '42501',
  'new row violates row-level security policy for table "bento_option_groups"',
  'a non-admin member cannot add a bento option group'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('bento-menus', 'rlsh/member.png') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'a non-admin member cannot upload to bento-menus'
);

-- ═══ 33-39. the bento admin ════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.bento_option_groups (restaurant_id, name)
     values ('b2b2b2b2-0000-0000-0000-0000000000a1', 'admin group') $$,
  'a bento admin can add an option group'
);
select lives_ok(
  $$ insert into public.bento_option_values (group_id, label)
     values ('b2b2b2b2-0000-0000-0000-0000000000a3', '無糖') $$,
  'a bento admin can add an option value'
);
select lives_ok(
  $$ insert into public.bento_order_items (order_id, menu_item_id, user_id, no_sauce)
     values ('rlsh-order', 'b2b2b2b2-0000-0000-0000-0000000000a2',
             'b2b2b2b2-0000-0000-0000-000000000002', false) $$,
  'a bento admin can add an order item for another member'
);
select lives_ok(
  $$ delete from public.bento_order_items
      where id = 'b2b2b2b2-0000-0000-0000-0000000000a5' $$,
  'a bento admin can delete another member''s order item'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('bento-menus', 'rlsh/admin.png') $$,
  'a bento admin can upload to bento-menus'
);
select lives_ok(
  $$ update storage.objects set name = 'rlsh/admin-2.png'
      where bucket_id = 'bento-menus' and name = 'rlsh/admin.png' $$,
  'a bento admin can rename a bento-menus object'
);
-- storage.protect_delete() refuses a DELETE unless the Storage API's flag is
-- set; set it the way the API does so the policy is what gets exercised.
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$ delete from storage.objects
      where bucket_id = 'bento-menus' and name = 'rlsh/admin-2.png' $$,
  'a bento admin can delete a bento-menus object'
);
reset role;

-- ═══ 40-41. the admin's writes landed ══════════════════════════════════════
select is(
  (select count(*) from public.bento_order_items
    where id = 'b2b2b2b2-0000-0000-0000-0000000000a5'),
  0::bigint,
  'the admin delete removed the order item'
);
select is(
  (select count(*) from public.bento_option_groups
    where restaurant_id = 'b2b2b2b2-0000-0000-0000-0000000000a1'),
  2::bigint,
  'the admin-added option group exists'
);

select * from finish();
rollback;
