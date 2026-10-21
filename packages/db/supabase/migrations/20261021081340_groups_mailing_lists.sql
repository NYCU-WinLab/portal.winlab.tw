-- /groups: portal-side authorization for managing Google Workspace mailing
-- lists. The member lists themselves live in Google and are never stored
-- here; this migration only records who may manage which group and what they
-- did. Groups are keyed by their Admin SDK Directory id (group_id), because a
-- group's email can be renamed in Google.
--
-- The Google credential holds a custom admin role over every group in the
-- domain, so "this person may only manage that group" is enforced by the
-- server action calling is_group_manager() before it calls Google, and
-- "never a gcp-* group" by the server action checking the group's address.
-- is_group_manager() is true for a portal admin on any id on purpose; the
-- gcp-* exclusion does not live here. The audit is append-only from the
-- service role, so a member can never write a row describing something that
-- did not happen.

create table public.group_managers (
  group_id    text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_managers_group_id_check
    check (group_id ~ '^[A-Za-z0-9]{1,64}$')
);

create table public.group_membership_audit (
  id           bigint generated always as identity primary key,
  -- No FK on purpose (same as ip_user_changes): the trail must outlive the
  -- actor's portal account, not be cascaded away with it.
  actor_id     uuid not null,
  group_id     text not null,
  group_email  text not null,
  -- Bounded so a forged request can't park arbitrary text here; the server
  -- action refuses longer input before it gets this far.
  member_email text not null
               constraint group_membership_audit_member_email_check
               check (char_length(member_email) <= 320),
  action       text not null check (action in ('add', 'remove')),
  outcome      text not null
               constraint group_membership_audit_outcome_check
               check (outcome in ('ok', 'already', 'not_found', 'protected', 'denied', 'error')),
  detail       text check (detail is null or char_length(detail) <= 500),
  created_at   timestamptz not null default now()
);
create index group_membership_audit_group_time
  on public.group_membership_audit (group_id, created_at desc);

comment on table public.group_managers is
  'Who may add/remove plain members of a Google mailing list from /groups. group_id holds the Directory group id. Assigned by portal admins via groups_assign_manager.';
comment on table public.group_membership_audit is
  'Every /groups add/remove attempt, including refused and failed ones. group_id holds the Directory group id. Inserted by the service role only.';

create function public.is_group_manager(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_portal_admin()
    or exists (
      select 1 from public.group_managers
      where group_id = p_group_id and user_id = auth.uid()
    )
  );
$$;

create function public.groups_assign_manager(p_group_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_portal_admin() then
    raise exception using errcode = '42501', message = 'Portal super admin required';
  end if;
  if p_group_id is null or p_group_id !~ '^[A-Za-z0-9]{1,64}$' then
    raise exception using errcode = '22023', message = 'Invalid group id';
  end if;
  insert into public.group_managers (group_id, user_id, assigned_by)
  values (p_group_id, p_user_id, auth.uid())
  on conflict (group_id, user_id) do nothing;
end;
$$;

create function public.groups_unassign_manager(p_group_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_portal_admin() then
    raise exception using errcode = '42501', message = 'Portal super admin required';
  end if;
  delete from public.group_managers
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

alter table public.group_managers enable row level security;
alter table public.group_membership_audit enable row level security;

create policy "own rows or portal admin read group_managers"
  on public.group_managers for select to authenticated
  using (user_id = auth.uid() or public.is_portal_admin());

create policy "group managers read their group's audit"
  on public.group_membership_audit for select to authenticated
  using (public.is_group_manager(group_id));

revoke all on public.group_managers, public.group_membership_audit
  from public, anon, authenticated, service_role;
grant select on public.group_managers, public.group_membership_audit to authenticated;
grant select on public.group_managers to service_role;
grant select, insert on public.group_membership_audit to service_role;

revoke all on function public.is_group_manager(text)
  from public, anon, authenticated, service_role;
revoke all on function public.groups_assign_manager(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.groups_unassign_manager(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_group_manager(text) to authenticated;
grant execute on function public.groups_assign_manager(text, uuid) to authenticated;
grant execute on function public.groups_unassign_manager(text, uuid) to authenticated;
