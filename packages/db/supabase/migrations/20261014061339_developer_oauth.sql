create table public.developer_apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  description text not null check (length(description) between 1 and 2000),
  contact_email text not null,
  privacy_url text not null,
  client_type text not null check (client_type in ('public', 'confidential')),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  approved_scopes text[] not null default array['profile'] check (approved_scopes <@ array['profile','name','groups'] and 'profile' = any(approved_scopes)),
  enabled boolean not null default true,
  secret_hash text,
  created_at timestamptz not null default now(),
  check ((client_type = 'public' and secret_hash is null) or (client_type = 'confidential' and secret_hash is not null and secret_hash ~ '^[a-f0-9]{64}$'))
);
create index developer_apps_owner_idx on public.developer_apps(owner_id);

create table public.developer_scope_requests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['name','groups']),
  purpose text not null check (length(purpose) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index developer_scope_requests_app_idx on public.developer_scope_requests(app_id);
create unique index developer_scope_requests_pending_idx on public.developer_scope_requests(app_id) where status = 'pending';

create table public.developer_grants (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.developer_apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['profile','name','groups']),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index developer_grants_app_idx on public.developer_grants(app_id);
create index developer_grants_user_idx on public.developer_grants(user_id);

create table public.developer_codes (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  grant_id uuid not null references public.developer_grants(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['profile','name','groups']),
  redirect_uri text not null,
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null
);
create index developer_codes_grant_idx on public.developer_codes(grant_id);
create table public.developer_tokens (
  access_hash text primary key check (access_hash ~ '^[a-f0-9]{64}$'),
  refresh_used boolean not null default false,
  refresh_hash text not null unique check (refresh_hash ~ '^[a-f0-9]{64}$'),
  grant_id uuid not null references public.developer_grants(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['profile','name','groups']),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null
);
create index developer_tokens_grant_idx on public.developer_tokens(grant_id);

alter table public.developer_apps enable row level security;
alter table public.developer_scope_requests enable row level security;
alter table public.developer_grants enable row level security;
alter table public.developer_codes enable row level security;
alter table public.developer_tokens enable row level security;
revoke all on public.developer_apps, public.developer_scope_requests, public.developer_grants, public.developer_codes, public.developer_tokens from public, anon, authenticated;
grant all on public.developer_apps, public.developer_scope_requests, public.developer_grants, public.developer_codes, public.developer_tokens to service_role;
grant select (id, owner_id, name, description, contact_email, privacy_url, client_type, redirect_uris, approved_scopes, enabled, created_at) on public.developer_apps to authenticated;
grant select on public.developer_scope_requests, public.developer_grants to authenticated;
create policy developer_grants_read on public.developer_grants for select to authenticated using (user_id = (select auth.uid()));
create policy developer_apps_read on public.developer_apps for select to authenticated using (
  owner_id = (select auth.uid()) or (select public.is_portal_admin()) or exists (select 1 from public.developer_grants g where g.app_id = developer_apps.id and g.user_id = (select auth.uid()))
);
create policy developer_scope_requests_read on public.developer_scope_requests for select to authenticated using (
  (select public.is_portal_admin()) or exists (select 1 from public.developer_apps a where a.id = app_id and a.owner_id = (select auth.uid()))
);

-- Credential, scope, and redirect changes invalidate in-flight authorizations too.
create function public.developer_invalidate_grants() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.enabled is distinct from new.enabled or old.secret_hash is distinct from new.secret_hash
    or old.redirect_uris is distinct from new.redirect_uris or old.approved_scopes is distinct from new.approved_scopes
    or old.client_type is distinct from new.client_type or old.owner_id is distinct from new.owner_id then
    delete from public.developer_grants where app_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.developer_invalidate_grants() from public, anon, authenticated;
create trigger developer_apps_invalidate after update on public.developer_apps for each row execute function public.developer_invalidate_grants();

create function public.developer_review_scope(p_request uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.developer_scope_requests;
begin
  if auth.uid() is null or not public.is_portal_admin() then raise exception 'Portal administrator required' using errcode = '42501'; end if;
  if p_approve is null or length(coalesce(p_note,'')) not between 1 and 2000 then raise exception 'Review note required' using errcode = '22023'; end if;
  select * into r from public.developer_scope_requests where id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'Request is not pending' using errcode = '22023'; end if;
  if p_approve then
    update public.developer_apps set approved_scopes = array(select distinct unnest(approved_scopes || r.scopes)) where id = r.app_id;
  end if;
  update public.developer_scope_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_request;
end;
$$;
revoke all on function public.developer_review_scope(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.developer_review_scope(uuid, boolean, text) to authenticated;

create function public.developer_check_grant() returns trigger language plpgsql set search_path = '' as $$
declare a public.developer_apps;
begin
  select * into a from public.developer_apps where id = new.app_id for share;
  if not found or not a.enabled or not new.scopes <@ a.approved_scopes then
    raise exception 'Application authorization unavailable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.developer_check_grant() from public, anon, authenticated;
create trigger developer_grants_check before insert on public.developer_grants for each row execute function public.developer_check_grant();

-- Keep consumed hashes until their grant ends so replay revokes descendants.
create function public.developer_consume_refresh(p_hash text) returns boolean
language plpgsql set search_path = '' as $$
declare t public.developer_tokens;
begin
  select * into t from public.developer_tokens where refresh_hash = p_hash for update;
  if not found then return false; end if;
  if t.refresh_used then
    delete from public.developer_grants where id = t.grant_id;
    return false;
  end if;
  update public.developer_tokens set refresh_used = true where refresh_hash = p_hash;
  return true;
end;
$$;
revoke all on function public.developer_consume_refresh(text) from public, anon, authenticated;
grant execute on function public.developer_consume_refresh(text) to service_role;
