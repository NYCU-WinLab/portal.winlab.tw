create table public.ip_user_settings (
  id boolean primary key default true check (id),
  subnet cidr not null check (family(subnet) = 4 and masklen(subnet) <= 30),
  gateway inet not null check (family(gateway) = 4 and masklen(gateway) = 32),
  dns_servers inet[] not null default '{}',
  source_updated_on date not null,
  constraint ip_user_settings_gateway_in_subnet check (
    gateway << subnet
    and gateway <> host(network(subnet))::inet
    and gateway <> host(broadcast(subnet))::inet
  )
);

create table public.ip_user_entries (
  id uuid primary key default gen_random_uuid(),
  ip inet not null unique check (family(ip) = 4 and masklen(ip) = 32),
  user_name text not null default '' check (char_length(user_name) <= 200),
  category text not null default 'unclassified' check (
    category in ('personal', 'shared', 'uncertain', 'experiment', 'empty', 'abnormal', 'unclassified')
  ),
  notes text not null default '' check (char_length(notes) <= 2000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Snapshots and actor identifiers outlive both entries and portal accounts.
create table public.ip_user_changes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'import')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid,
  changed_at timestamptz not null default now(),
  constraint ip_user_changes_has_snapshot check (before_data is not null or after_data is not null)
);
create index ip_user_changes_entry_time on public.ip_user_changes (entry_id, changed_at desc);

alter table public.ip_user_settings enable row level security;
alter table public.ip_user_entries enable row level security;
alter table public.ip_user_changes enable row level security;

create policy "portal super admins read IP USER settings"
  on public.ip_user_settings for select to authenticated using (public.is_portal_admin());
create policy "portal super admins read IP USER entries"
  on public.ip_user_entries for select to authenticated using (public.is_portal_admin());
create policy "portal super admins read IP USER audit"
  on public.ip_user_changes for select to authenticated using (public.is_portal_admin());

revoke all on public.ip_user_settings, public.ip_user_entries, public.ip_user_changes
  from public, anon, authenticated, service_role;
grant select on public.ip_user_settings, public.ip_user_entries, public.ip_user_changes to authenticated;
-- The private import writes configuration and source rows, without broad default grants.
grant select, insert, update, delete on public.ip_user_settings, public.ip_user_entries to service_role;
grant select, insert on public.ip_user_changes to service_role;

create function public.save_ip_user_entry(
  p_id uuid,
  p_ip text,
  p_user_name text,
  p_category text,
  p_notes text,
  p_expected_revision integer
)
returns public.ip_user_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.ip_user_settings;
  v_before public.ip_user_entries;
  v_after public.ip_user_entries;
  v_ip inet;
  v_user_name text := regexp_replace(coalesce(p_user_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_notes text := regexp_replace(coalesce(p_notes, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if auth.uid() is null or not public.is_portal_admin() then
    raise exception using errcode = '42501', message = 'Portal super admin required';
  end if;

  if p_id is null and p_expected_revision is not null then
    raise exception using errcode = '22023', message = 'New entries must not include a revision';
  end if;
  if p_id is not null and (p_expected_revision is null or p_expected_revision < 1) then
    raise exception using errcode = '22023', message = 'Expected revision must be a positive integer';
  end if;
  if p_category is null or p_category not in ('personal', 'shared', 'uncertain', 'experiment', 'empty', 'abnormal', 'unclassified') then
    raise exception using errcode = '22023', message = 'Invalid IP USER category';
  end if;
  if char_length(v_user_name) > 200 then
    raise exception using errcode = '22023', message = 'User name must be at most 200 characters';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception using errcode = '22023', message = 'Notes must be at most 2000 characters';
  end if;
  if p_ip is null or btrim(p_ip) !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
    raise exception using errcode = '22023', message = 'IP must be a host IPv4 address';
  end if;
  begin
    v_ip := btrim(p_ip)::inet;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'IP must be a host IPv4 address';
  end;

  select * into v_settings from public.ip_user_settings where id = true for share;
  if not found then
    raise exception using errcode = '22023', message = 'IP USER network settings are not configured';
  end if;
  if not (v_ip << v_settings.subnet) then
    raise exception using errcode = '22023', message = 'IP is outside the configured subnet';
  end if;
  if v_ip = host(network(v_settings.subnet))::inet then
    raise exception using errcode = '22023', message = 'The network address cannot be assigned';
  end if;

  if p_id is not null then
    select * into v_before from public.ip_user_entries where id = p_id for update;
    if not found or v_before.revision <> p_expected_revision then
      raise exception using errcode = 'P0001', message = 'IP USER entry was changed or deleted; refresh and try again';
    end if;
    if v_before.ip in (v_settings.gateway, host(broadcast(v_settings.subnet))::inet) and v_ip <> v_before.ip then
      raise exception using errcode = '22023', message = 'Gateway and broadcast IP addresses cannot be changed';
    end if;
  end if;
  if v_ip in (v_settings.gateway, host(broadcast(v_settings.subnet))::inet) and (p_id is null or v_ip <> v_before.ip) then
    raise exception using errcode = '22023', message = 'Gateway and broadcast addresses are reserved';
  end if;

  begin
    if p_id is null then
      insert into public.ip_user_entries (ip, user_name, category, notes, updated_by)
      values (v_ip, v_user_name, p_category, v_notes, auth.uid())
      returning * into v_after;
    else
      update public.ip_user_entries
      set ip = v_ip, user_name = v_user_name, category = p_category, notes = v_notes,
          revision = revision + 1, updated_at = now(), updated_by = auth.uid()
      where id = p_id
      returning * into v_after;
    end if;
  exception when unique_violation then
    raise exception using errcode = '22023', message = 'IP address already exists';
  end;

  insert into public.ip_user_changes (entry_id, action, before_data, after_data, actor_id)
  values (
    v_after.id,
    case when p_id is null then 'create' else 'update' end,
    case when p_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    auth.uid()
  );
  return v_after;
end;
$$;

create function public.delete_ip_user_entry(p_id uuid, p_expected_revision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.ip_user_settings;
  v_before public.ip_user_entries;
begin
  if auth.uid() is null or not public.is_portal_admin() then
    raise exception using errcode = '42501', message = 'Portal super admin required';
  end if;
  if p_id is null then
    raise exception using errcode = '22023', message = 'Entry ID is required';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'Expected revision must be a positive integer';
  end if;
  select * into v_settings from public.ip_user_settings where id = true for share;
  if not found then
    raise exception using errcode = '22023', message = 'IP USER network settings are not configured';
  end if;
  select * into v_before from public.ip_user_entries where id = p_id for update;
  if not found or v_before.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'IP USER entry was changed or deleted; refresh and try again';
  end if;
  if v_before.ip in (v_settings.gateway, host(broadcast(v_settings.subnet))::inet) then
    raise exception using errcode = '22023', message = 'Gateway and broadcast entries cannot be deleted';
  end if;
  delete from public.ip_user_entries where id = p_id;
  insert into public.ip_user_changes (entry_id, action, before_data, after_data, actor_id)
  values (p_id, 'delete', to_jsonb(v_before), null, auth.uid());
end;
$$;

revoke all on function public.save_ip_user_entry(uuid, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_ip_user_entry(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.save_ip_user_entry(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.delete_ip_user_entry(uuid, integer) to authenticated;
