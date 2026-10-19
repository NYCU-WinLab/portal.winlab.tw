-- groups-mailing-lists.test.sql — runs via `supabase test db`.
--
-- Pins the authorization half of /groups: who may manage which Google group
-- is portal data, and the audit is append-only from the service role. Groups
-- are keyed by their Directory API id. Like ip-user-management.test.sql this
-- file grants only pgTAP's own helpers, so the ACLs exercised are exactly the
-- ones the migration leaves behind.

begin;
create extension if not exists pgtap with schema public;
select no_plan();

do $$
declare helper record;
begin
  for helper in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_depend d on d.objid = p.oid and d.classid = 'pg_proc'::regclass
    join pg_extension e on e.oid = d.refobjid
    where e.extname = 'pgtap' and d.deptype = 'e'
  loop
    execute format('grant execute on function %s to authenticated, anon, service_role', helper.signature);
  end loop;
end;
$$;

-- ═══ structure & ACL ═══════════════════════════════════════════════════════
select has_table('public', 'group_managers', 'group_managers exists');
select has_table('public', 'group_membership_audit', 'group_membership_audit exists');

select ok(c.relrowsecurity, c.relname || ' enables RLS')
from pg_class c where c.oid in (
  'public.group_managers'::regclass, 'public.group_membership_audit'::regclass
);

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
   from aclexplode(c.relacl) a where a.grantee = 'authenticated'::regrole),
  array['SELECT'], c.relname || ' grants authenticated only SELECT'
)
from pg_class c where c.oid in (
  'public.group_managers'::regclass, 'public.group_membership_audit'::regclass
);

select is(
  (select count(*)::integer from aclexplode(c.relacl) a
   where a.grantee in (0, 'anon'::regrole::oid)),
  0, c.relname || ' grants anonymous callers nothing'
)
from pg_class c where c.oid in (
  'public.group_managers'::regclass, 'public.group_membership_audit'::regclass
);

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
   from aclexplode(c.relacl) a where a.grantee = 'service_role'::regrole),
  array['INSERT', 'SELECT'], 'service_role may only read and append the audit'
)
from pg_class c where c.oid = 'public.group_membership_audit'::regclass;

select ok(p.prosecdef and p.proconfig @> array['search_path=""'],
  p.proname || ' is SECURITY DEFINER with an empty search path')
from pg_proc p where p.oid in (
  'public.is_group_manager(text)'::regprocedure,
  'public.groups_assign_manager(text,uuid)'::regprocedure,
  'public.groups_unassign_manager(text,uuid)'::regprocedure
);

select ok(not has_function_privilege('anon', p.oid, 'EXECUTE'),
  p.proname || ' denies anonymous execution')
from pg_proc p where p.oid in (
  'public.is_group_manager(text)'::regprocedure,
  'public.groups_assign_manager(text,uuid)'::regprocedure,
  'public.groups_unassign_manager(text,uuid)'::regprocedure
);

-- ═══ fixtures ══════════════════════════════════════════════════════════════
insert into auth.users (id) values
  ('9a9a9a9a-0000-0000-0000-000000000001'), -- portal admin
  ('9a9a9a9a-0000-0000-0000-000000000002'), -- manager of group aaa
  ('9a9a9a9a-0000-0000-0000-000000000003'); -- plain member
insert into public.user_profiles (id, is_admin, roles) values
  ('9a9a9a9a-0000-0000-0000-000000000001', true,  '{}'),
  ('9a9a9a9a-0000-0000-0000-000000000002', false, '{}'),
  ('9a9a9a9a-0000-0000-0000-000000000003', false, '{}');

-- ═══ portal admin assigns ══════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.groups_assign_manager('aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  'portal admin assigns a manager');
select lives_ok($$select public.groups_assign_manager('aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  'assigning twice is a no-op');
select throws_ok($$select public.groups_assign_manager('groups/aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '22023', null, 'a group id that is not a Directory id is rejected');
select throws_ok($$select public.groups_assign_manager('', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '22023', null, 'an empty group id is rejected');
select ok(public.is_group_manager('zzz'), 'portal admin manages every group id');
select is((select count(*)::integer from public.group_managers), 1, 'portal admin reads all manager rows');
reset role;

-- ═══ manager ═══════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(public.is_group_manager('aaa'), 'manager manages their group');
select ok(not public.is_group_manager('bbb'), 'manager does not manage another group');
select throws_ok($$select public.groups_assign_manager('bbb', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '42501', null, 'a manager cannot assign themselves elsewhere');
select throws_ok($$select public.groups_unassign_manager('aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '42501', null, 'a manager cannot unassign, not even themselves');
select throws_ok($$insert into public.group_managers (group_id, user_id) values ('bbb', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '42501', null, 'direct insert into group_managers is denied');
select throws_ok($$insert into public.group_membership_audit (actor_id, group_id, group_email, member_email, action, outcome)
  values ('9a9a9a9a-0000-0000-0000-000000000002', 'aaa', 'a@winlab.tw', 'x@gmail.com', 'add', 'ok')$$,
  '42501', null, 'members cannot forge audit rows');
reset role;

-- ═══ service role writes the audit; RLS decides who reads it ═══════════════
set local role service_role;
insert into public.group_membership_audit (actor_id, group_id, group_email, member_email, action, outcome)
values
  ('9a9a9a9a-0000-0000-0000-000000000002', 'aaa', 'a@winlab.tw', 'x@gmail.com', 'add', 'ok'),
  ('9a9a9a9a-0000-0000-0000-000000000001', 'bbb', 'b@winlab.tw', 'y@gmail.com', 'remove', 'protected');
-- 2026-10-19: the `unsupported` outcome was dropped; anything unexpected is `error`.
select throws_ok($$insert into public.group_membership_audit (actor_id, group_id, group_email, member_email, action, outcome)
  values ('9a9a9a9a-0000-0000-0000-000000000001', 'aaa', 'a@winlab.tw', 'z@gmail.com', 'add', 'unsupported')$$,
  '23514', null, 'outcomes outside the six /groups reports are rejected');
select throws_ok($$insert into public.group_membership_audit (actor_id, group_id, group_email, member_email, action, outcome)
  values ('9a9a9a9a-0000-0000-0000-000000000001', 'aaa', 'a@winlab.tw', repeat('x', 321), 'add', 'error')$$,
  '23514', null, 'a member_email longer than 320 characters is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.group_membership_audit), 1,
  'a manager reads only their group''s audit');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(not public.is_group_manager('aaa'), 'plain member manages nothing');
select is((select count(*)::integer from public.group_membership_audit), 0, 'plain member reads no audit');
select is((select count(*)::integer from public.group_managers), 0, 'plain member reads no manager rows');
select throws_ok($$select public.groups_unassign_manager('aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  '42501', null, 'a plain member cannot unassign anyone');
reset role;

-- ═══ unassign ══════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.groups_unassign_manager('aaa', '9a9a9a9a-0000-0000-0000-000000000002')$$,
  'portal admin unassigns');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a9a9a9a-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(not public.is_group_manager('aaa'), 'unassigned manager loses the group');
reset role;

set local role anon;
select throws_ok($$select * from public.group_managers$$, '42501', null, 'anon cannot read managers');
select throws_ok($$select * from public.group_membership_audit$$, '42501', null, 'anon cannot read audit');
reset role;

select * from finish();
rollback;
