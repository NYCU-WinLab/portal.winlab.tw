-- copy_bento_order_from_user ("跟他一樣", #1131) regression suite.
-- Runs via `supabase test db`.
--
-- The function is SECURITY DEFINER, so every guard it carries is the only guard
-- there is — RLS does not re-check it. These assertions cover each one, plus the
-- two behaviours that make it worth having a function at all: it overwrites (it
-- does not append), and it carries the drink option picks that a client insert
-- physically cannot write (bento_order_item_options has no INSERT policy).

begin;
create extension if not exists pgtap with schema public;
-- pgTAP assertion fns must be callable after we drop to the authenticated role.
grant execute on all functions in schema public to authenticated;

select plan(12);

-- ── ACL ─────────────────────────────────────────────────────────────────────
-- anon must NOT be able to reach this function. Two grants can give it that,
-- and the first version of this assertion only checked one of them:
--
--   * a DIRECT grant to anon — this project's `alter default privileges` hands
--     it out on every new function in public, so an explicit per-role revoke is
--     the only thing that removes it, and an untested revoke is silently
--     reversible (#1104);
--   * a grant to PUBLIC — PostgreSQL's own default on CREATE FUNCTION, which
--     anon inherits as a member of PUBLIC. aclexplode reports it as grantee 0,
--     printing as '-' through ::regrole::text, so a check written against the
--     literal string 'anon' walks straight past it.
--
-- Checking only the first is what let 20260917115311 ship with anon still
-- holding EXECUTE through PUBLIC while this file reported green. Assert the
-- whole grantee set instead of probing for one name — a new grantee appearing
-- should fail loudly rather than slip through an allow-list of one.
--
-- The blanket `grant execute on all functions ... to authenticated` above adds
-- only `authenticated`, which is expected here anyway, so it cannot mask either
-- hole.
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
     from aclexplode((select proacl from pg_proc
                      where oid = 'public.copy_bento_order_from_user(text, uuid)'::regprocedure)) a
    where a.privilege_type = 'EXECUTE'),
  array['authenticated', 'postgres', 'service_role'],
  'copy_bento_order_from_user is executable by authenticated + service_role only — not anon, not PUBLIC'
);

-- ── seed (as superuser — bypasses RLS) ──────────────────────────────────────
-- A = the copier, B = the source, C = an unrelated member.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.user_profiles (id, email, is_admin, roles) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.local', false, '{}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.local', false, '{}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@test.local', false, '{}');

-- A meal shop with an `additional` option list, and a drink shop with a
-- required single-select group — the two shapes the copy has to carry.
insert into public.bento_menus (id, name, phone, additional, kind) values
  ('d0000000-0000-0000-0000-000000000001', '便當店', '02', '["普通","大碗"]'::jsonb, 'meal'),
  ('d0000000-0000-0000-0000-000000000002', '飲料店', '03', null, 'drinks');
insert into public.bento_menu_items (id, restaurant_id, name, price) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '雞腿飯', 100),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '排骨飯', 90),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '紅茶', 35);
insert into public.bento_option_groups (id, restaurant_id, name, required, single_select, sort_order)
values ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '甜度', true, true, 1);
insert into public.bento_option_values (id, group_id, label, price_delta, sort_order) values
  ('f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001', '無糖', 0, 1),
  ('f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-000000000001', '半糖', 0, 2);

insert into public.bento_orders (id, restaurant_id, status, created_by, order_date) values
  ('20260917',   'd0000000-0000-0000-0000-000000000001', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-09-17'),
  ('20260917-2', 'd0000000-0000-0000-0000-000000000002', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-09-17'),
  ('20260916',   'd0000000-0000-0000-0000-000000000001', 'closed', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-09-16');

-- B's meal order: two lines, one of them 不醬 + 大碗. A has one unrelated line
-- that the overwrite must remove.
insert into public.bento_order_items (id, order_id, menu_item_id, user_id, no_sauce, additional) values
  ('0a000000-0000-0000-0000-000000000001', '20260917', 'e0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true,  1),
  ('0a000000-0000-0000-0000-000000000002', '20260917', 'e0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, 0),
  ('0a000000-0000-0000-0000-000000000003', '20260917', 'e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 0);

-- B's drink order, with the required 甜度 pick attached.
insert into public.bento_order_items (id, order_id, menu_item_id, user_id, no_sauce) values
  ('0b000000-0000-0000-0000-000000000001', '20260917-2', 'e0000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
insert into public.bento_order_item_options (order_item_id, option_value_id) values
  ('0b000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000a2');

-- ── impersonate A ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

-- 2. happy path reports the number of lines copied
select is(
  public.copy_bento_order_from_user('20260917', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  2,
  'copying B''s two-line meal order reports 2'
);

-- 3. overwrite, not append: A's pre-existing 排骨飯/普通 line is gone, so A now
--    holds exactly B's two lines (3 would mean it appended).
select is(
  (select count(*)::int from public.bento_order_items
   where order_id = '20260917' and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'A ends up with exactly B''s line count — the previous order was replaced, not added to'
);

-- 4. every per-line customisation came across
select results_eq(
  $$ select menu_item_id, no_sauce, additional
     from public.bento_order_items
     where order_id = '20260917' and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     order by menu_item_id $$,
  $$ select menu_item_id, no_sauce, additional
     from public.bento_order_items
     where order_id = '20260917' and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     order by menu_item_id $$,
  'menu_item_id / no_sauce / additional are carried verbatim'
);

-- 5. B is untouched by the overwrite
select is(
  (select count(*)::int from public.bento_order_items
   where order_id = '20260917' and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  2,
  'the source member''s own items are left alone'
);

-- 6-7. drinks: the option picks travel with the copy. This is the case a
--      client-side copy cannot do at all — bento_order_item_options has no
--      INSERT policy, only a SECURITY DEFINER function may write it.
select lives_ok(
  $$ select public.copy_bento_order_from_user('20260917-2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'copying a drink order succeeds'
);
select results_eq(
  $$ select o.option_value_id
     from public.bento_order_item_options o
     join public.bento_order_items i on i.id = o.order_item_id
     where i.order_id = '20260917-2'
       and i.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('f0000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'the copied drink carries the source''s 甜度 pick'
);

-- 8-10. guards
select throws_ok(
  $$ select public.copy_bento_order_from_user('20260916', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'P0001',
  '訂單不存在或已關閉',
  'a closed order cannot be copied into'
);
select throws_ok(
  $$ select public.copy_bento_order_from_user('20260917', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001',
  '不能複製自己的訂餐',
  'copying from yourself is rejected'
);
select throws_ok(
  $$ select public.copy_bento_order_from_user('20260917', 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'P0001',
  '對方在此訂單沒有訂餐',
  'copying from someone who has not ordered is rejected'
);

-- 11. the point of that last guard: it runs BEFORE the delete, so a mistaken
--     tap on an empty person cannot leave me with nothing.
select is(
  (select count(*)::int from public.bento_order_items
   where order_id = '20260917' and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  'a rejected copy leaves my existing order intact'
);

-- 12. no session → no copy. Stays on the `authenticated` role (anon has no
--     EXECUTE at all, per assertion 1) and drops the `sub` claim instead, so
--     this exercises the function's own auth.uid() guard rather than the ACL.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.copy_bento_order_from_user('20260917', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'P0001',
  '請先登入',
  'a caller with no user id is rejected'
);

select * from finish();
rollback;
