begin;
create extension if not exists pgtap with schema public;
select no_plan();

-- Grant only pgTAP helpers: widening application RPC grants would hide ACL bugs.
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

select has_table('public', 'ip_user_settings', 'IP USER settings exist');
select has_table('public', 'ip_user_entries', 'IP USER entries exist');
select has_table('public', 'ip_user_changes', 'IP USER audit exists');

select ok(c.relrowsecurity, c.relname || ' enables RLS')
from pg_class c where c.oid in (
  'public.ip_user_settings'::regclass,
  'public.ip_user_entries'::regclass,
  'public.ip_user_changes'::regclass
);
select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
   from aclexplode(c.relacl) a where a.grantee = 'authenticated'::regrole),
  array['SELECT'], c.relname || ' grants authenticated only SELECT'
)
from pg_class c where c.oid in (
  'public.ip_user_settings'::regclass,
  'public.ip_user_entries'::regclass,
  'public.ip_user_changes'::regclass
);
select is(
  (select count(*)::integer from aclexplode(c.relacl) a
   where a.grantee in (0, 'anon'::regrole::oid)),
  0, c.relname || ' grants anonymous callers nothing'
)
from pg_class c where c.oid in (
  'public.ip_user_settings'::regclass,
  'public.ip_user_entries'::regclass,
  'public.ip_user_changes'::regclass
);
select ok(p.prosecdef and p.proconfig @> array['search_path=""'],
  p.proname || ' is SECURITY DEFINER with an empty search path')
from pg_proc p where p.oid in (
  'public.save_ip_user_entry(uuid,text,text,text,text,integer)'::regprocedure,
  'public.delete_ip_user_entry(uuid,integer)'::regprocedure
);
select ok(not has_function_privilege('anon', p.oid, 'EXECUTE'),
  p.proname || ' denies anonymous execution')
from pg_proc p where p.oid in (
  'public.save_ip_user_entry(uuid,text,text,text,text,integer)'::regprocedure,
  'public.delete_ip_user_entry(uuid,integer)'::regprocedure
);

insert into auth.users (id) values
  ('eeeeeeee-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002'),
  ('eeeeeeee-0000-0000-0000-000000000003');
insert into public.user_profiles (id, is_admin, roles) values
  ('eeeeeeee-0000-0000-0000-000000000001', true, '{}'),
  ('eeeeeeee-0000-0000-0000-000000000002', false, '{}'),
  ('eeeeeeee-0000-0000-0000-000000000003', false, '{"admin":["admin"],"door":["admin"],"meetings":["admin"]}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', null)$$,
  '22023', 'IP USER network settings are not configured', 'saving requires imported settings');
reset role;

set local role service_role;
insert into public.ip_user_settings (id, subnet, gateway, dns_servers, source_updated_on)
values (true, '192.0.2.0/24', '192.0.2.1', array['198.51.100.53'::inet], '2040-01-01');
insert into public.ip_user_entries (id, ip, user_name, category, notes) values
  ('dddddddd-0000-0000-0000-000000000001', '192.0.2.1', 'Example gateway', 'shared', ''),
  ('dddddddd-0000-0000-0000-000000000002', '192.0.2.255', 'Example broadcast', 'unclassified', '');
reset role;

set local role anon;
select throws_ok($$select * from public.ip_user_entries$$, '42501', null, 'anonymous entries read is denied');
select throws_ok($$select * from public.ip_user_settings$$, '42501', null, 'anonymous settings read is denied');
select throws_ok($$select * from public.ip_user_changes$$, '42501', null, 'anonymous audit read is denied');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', null)$$,
  '42501', null, 'anonymous save execution is denied');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-000000000001', 1)$$,
  '42501', null, 'anonymous delete execution is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.ip_user_entries), 0, 'ordinary members cannot read entries');
select is((select count(*)::integer from public.ip_user_settings), 0, 'ordinary members cannot read settings');
select is((select count(*)::integer from public.ip_user_changes), 0, 'ordinary members cannot read audit');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', null)$$,
  '42501', 'Portal super admin required', 'ordinary members cannot save');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-000000000001', 1)$$,
  '42501', 'Portal super admin required', 'ordinary members cannot delete');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.ip_user_entries), 0, 'app admins cannot read entries');
select is((select count(*)::integer from public.ip_user_settings), 0, 'app admins cannot read settings');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', null)$$,
  '42501', 'Portal super admin required', 'app admins cannot save');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-000000000001', 1)$$,
  '42501', 'Portal super admin required', 'app admins cannot delete');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', null)$$,
  '42501', 'Portal super admin required', 'a missing auth.uid is denied');

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.ip_user_entries), 2, 'super admins read imported entries');
select is((select count(*)::integer from public.ip_user_settings), 1, 'super admins read network settings');
select throws_ok($$insert into public.ip_user_entries (ip, user_name, category, notes) values ('192.0.2.20', 'Example', 'personal', '')$$,
  '42501', null, 'super admins cannot bypass the save RPC');
select throws_ok($$update public.ip_user_entries set notes = 'bypass'$$,
  '42501', null, 'super admins cannot bypass revision checks');
select throws_ok($$delete from public.ip_user_entries$$,
  '42501', null, 'super admins cannot bypass audited delete');
select throws_ok($$update public.ip_user_settings set gateway = '192.0.2.2'$$,
  '42501', null, 'network settings are read-only in the portal');

select throws_ok(format('select public.save_ip_user_entry(null, %L, %L, %L, %L, null)', invalid_ip, 'Example', 'personal', ''),
  '22023', 'IP must be a host IPv4 address', 'rejects invalid host IP: ' || coalesce(invalid_ip, 'NULL'))
from (values (null::text), (''), ('not-an-ip'), ('192.0.2.10/24'), ('2001:db8::10'), ('192.0.2'), ('192.0.2.999')) t(invalid_ip);
select throws_ok($$select public.save_ip_user_entry(null, '198.51.100.10', 'Example', 'personal', '', null)$$,
  '22023', 'IP is outside the configured subnet', 'rejects out-of-subnet IP');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.0', 'Example', 'personal', '', null)$$,
  '22023', 'The network address cannot be assigned', 'rejects network address');
select throws_ok(format('select public.save_ip_user_entry(null, %L, %L, %L, %L, null)', reserved_ip, 'Example', 'personal', ''),
  '22023', 'Gateway and broadcast addresses are reserved', 'cannot create reserved address: ' || reserved_ip)
from (values ('192.0.2.1'), ('192.0.2.255')) t(reserved_ip);
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'invalid', '', null)$$,
  '22023', 'Invalid IP USER category', 'rejects unknown category');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', null, '', null)$$,
  '22023', 'Invalid IP USER category', 'rejects null category');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', repeat('x', 201), 'personal', '', null)$$,
  '22023', 'User name must be at most 200 characters', 'enforces user name limit');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', repeat('x', 2001), null)$$,
  '22023', 'Notes must be at most 2000 characters', 'enforces notes limit');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Example', 'personal', '', 1)$$,
  '22023', 'New entries must not include a revision', 'new entries cannot claim a revision');
select throws_ok($$select public.save_ip_user_entry('dddddddd-0000-0000-0000-000000000001', '192.0.2.1', 'Example', 'personal', '', null)$$,
  '22023', 'Expected revision must be a positive integer', 'updates require a revision');
select throws_ok($$select public.save_ip_user_entry('dddddddd-0000-0000-0000-000000000001', '192.0.2.1', 'Example', 'personal', '', 0)$$,
  '22023', 'Expected revision must be a positive integer', 'updates require a positive revision');
select throws_ok($$select public.delete_ip_user_entry(null, 1)$$,
  '22023', 'Entry ID is required', 'deletion requires an ID');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-000000000001', 0)$$,
  '22023', 'Expected revision must be a positive integer', 'deletion requires a positive revision');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-000000000001', null)$$,
  '22023', 'Expected revision must be a positive integer', 'deletion requires a revision');

create temp table created_entry as
select * from public.save_ip_user_entry(null, ' 192.0.2.10 ', E'\t Example owner \r\n', 'personal', E'\t Example note \n', null);
select is((select user_name from created_entry), 'Example owner', 'save trims user name');
select is((select notes from created_entry), 'Example note', 'save trims notes');
select is((select host(ip) from created_entry), '192.0.2.10', 'save normalizes IP');
select is((select revision from created_entry), 1, 'new entry starts at revision one');
select is((select updated_by from created_entry), auth.uid(), 'updated_by comes from authenticated actor');
select is((select count(*)::integer from public.ip_user_changes), 1, 'create writes one audit event');
select ok((select before_data is null and after_data ->> 'user_name' = 'Example owner'
  and actor_id = auth.uid() and action = 'create' and changed_at is not null
  from public.ip_user_changes), 'create audit captures state and trusted actor');
select throws_ok($$select public.save_ip_user_entry(null, '192.0.2.10', 'Duplicate', 'personal', '', null)$$,
  '22023', 'IP address already exists', 'duplicate IP gets a stable validation error');

select lives_ok($$select public.save_ip_user_entry((select id from created_entry), '192.0.2.11', 'Updated owner', 'experiment', 'Updated note', 1)$$,
  'super admin updates an entry and its IP');
select is((select revision from public.ip_user_entries where id = (select id from created_entry)), 2, 'update increments revision');
select ok((select before_data ->> 'user_name' = 'Example owner' and after_data ->> 'user_name' = 'Updated owner'
  and before_data ->> 'revision' = '1' and after_data ->> 'revision' = '2'
  from public.ip_user_changes where action = 'update'), 'update audit contains before and after snapshots');
select throws_ok($$select public.save_ip_user_entry((select id from created_entry), '192.0.2.12', 'Stale', 'empty', '', 1)$$,
  'P0001', 'IP USER entry was changed or deleted; refresh and try again', 'stale save cannot overwrite');
select throws_ok($$select public.delete_ip_user_entry((select id from created_entry), 1)$$,
  'P0001', 'IP USER entry was changed or deleted; refresh and try again', 'stale delete cannot remove');
select throws_ok($$select public.save_ip_user_entry('dddddddd-0000-0000-0000-999999999999', '192.0.2.12', 'Missing', 'empty', '', 1)$$,
  'P0001', 'IP USER entry was changed or deleted; refresh and try again', 'missing save has conflict error');
select throws_ok($$select public.delete_ip_user_entry('dddddddd-0000-0000-0000-999999999999', 1)$$,
  'P0001', 'IP USER entry was changed or deleted; refresh and try again', 'missing delete has conflict error');
select is((select count(*)::integer from public.ip_user_changes), 2, 'failed saves and deletes do not write audit');
select is((select host(ip) from public.ip_user_entries where id = (select id from created_entry)), '192.0.2.11', 'failed writes preserve the saved value');

select lives_ok($$select public.save_ip_user_entry('dddddddd-0000-0000-0000-000000000001', '192.0.2.1', 'Renamed gateway', 'shared', 'Reviewed', 1)$$,
  'existing gateway labels can be edited');
select lives_ok($$select public.save_ip_user_entry('dddddddd-0000-0000-0000-000000000002', '192.0.2.255', 'Renamed broadcast', 'abnormal', 'Reviewed', 1)$$,
  'existing broadcast labels can be edited');
select throws_ok(format('select public.save_ip_user_entry(%L, %L, %L, %L, %L, 2)', entry_id, '192.0.2.30', 'Moved', 'shared', ''),
  '22023', 'Gateway and broadcast IP addresses cannot be changed', 'reserved IP cannot be moved')
from (values ('dddddddd-0000-0000-0000-000000000001'), ('dddddddd-0000-0000-0000-000000000002')) t(entry_id);
select throws_ok(format('select public.delete_ip_user_entry(%L, 2)', entry_id),
  '22023', 'Gateway and broadcast entries cannot be deleted', 'reserved entry cannot be deleted')
from (values ('dddddddd-0000-0000-0000-000000000001'), ('dddddddd-0000-0000-0000-000000000002')) t(entry_id);
select throws_ok($$select public.save_ip_user_entry((select id from created_entry), '192.0.2.1', 'Moved', 'shared', '', 2)$$,
  '22023', 'Gateway and broadcast addresses are reserved', 'ordinary entries cannot move onto a reserved address');
select lives_ok($$select public.delete_ip_user_entry((select id from created_entry), 2)$$, 'super admin can delete current revision');
select is((select count(*)::integer from public.ip_user_entries where id = (select id from created_entry)), 0, 'delete removes the entry');
select ok((select before_data ->> 'user_name' = 'Updated owner' and after_data is null and actor_id = auth.uid()
  from public.ip_user_changes where action = 'delete'), 'delete audit survives entry deletion');
select throws_ok($$insert into public.ip_user_changes (entry_id, action, after_data) values ('dddddddd-0000-0000-0000-000000000001', 'create', '{}')$$,
  '42501', null, 'super admins cannot forge audit entries');
select throws_ok($$update public.ip_user_changes set actor_id = null$$, '42501', null, 'super admins cannot edit audit');
select throws_ok($$delete from public.ip_user_changes$$, '42501', null, 'super admins cannot delete audit');

select lives_ok(format('select public.save_ip_user_entry(null, %L, null, %L, null, null)', '192.0.2.' || (row_number() over () + 100), category),
  'accepts category ' || category)
from unnest(array['personal', 'shared', 'uncertain', 'experiment', 'empty', 'abnormal', 'unclassified']) category;
select ok((select bool_and(user_name = '' and notes = '') from public.ip_user_entries where ip > '192.0.2.100'::inet and ip < '192.0.2.200'::inet),
  'null user name and notes normalize to empty strings');
reset role;

set local role service_role;
select throws_ok($$update public.ip_user_changes set before_data = '{}'$$, '42501', null, 'service role cannot rewrite audit history');
select throws_ok($$delete from public.ip_user_changes$$, '42501', null, 'service role cannot erase audit history');
select throws_ok($$truncate public.ip_user_changes$$, '42501', null, 'service role cannot truncate audit history');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.ip_user_changes), 0, 'ordinary members cannot read populated audit');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.ip_user_changes), 0, 'app admins cannot read populated audit');
reset role;

select * from finish();
rollback;
