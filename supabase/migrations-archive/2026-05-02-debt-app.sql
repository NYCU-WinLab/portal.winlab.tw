-- debt app: bill-splitting (migrated from debit.winlab.tw).
-- Net-balance bookkeeping with monthly cron-generated settlements.
--
-- Schema mirrors the legacy `debit_*` tables but renamed to `debt_*` to align
-- with the app namespace. RPCs and helpers are also `debt_`-prefixed so the new
-- tables can run side-by-side with the old ones during transition. A follow-up
-- migration drops `debit_*` once portal /debt is verified stable.

-- =============================================================================
-- Tables
-- =============================================================================

create table public.debt_expenses (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.user_profiles(id) default auth.uid(),
  name         text not null,
  description  text,
  created_at   timestamptz not null default now()
);

create index debt_expenses_creator_created
  on public.debt_expenses (creator_id, created_at desc);

create table public.debt_expense_items (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.debt_expenses(id) on delete cascade,
  debtor_id    uuid not null references public.user_profiles(id),
  amount       numeric not null check (amount > 0),
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index debt_expense_items_debtor on public.debt_expense_items (debtor_id);
create index debt_expense_items_expense on public.debt_expense_items (expense_id);

create table public.debt_settlements (
  id              uuid primary key default gen_random_uuid(),
  period          text not null check (period ~ '^\d{4}-\d{2}$'),
  from_user_id    uuid not null references public.user_profiles(id),
  to_user_id      uuid not null references public.user_profiles(id),
  amount          numeric not null check (amount > 0),
  from_confirmed  boolean not null default false,
  to_confirmed    boolean not null default false,
  settled_at      timestamptz,
  created_at      timestamptz not null default now(),
  check (from_user_id <> to_user_id),
  unique (period, from_user_id, to_user_id)
);

create index debt_settlements_users
  on public.debt_settlements (from_user_id, to_user_id, period);

-- =============================================================================
-- Trigger: debtor cannot be the same as expense creator
-- =============================================================================

create or replace function public.debt_check_debtor_not_creator()
returns trigger
language plpgsql
as $$
begin
  if new.debtor_id = (select creator_id from public.debt_expenses where id = new.expense_id) then
    raise exception 'debtor cannot be the same as expense creator';
  end if;
  return new;
end;
$$;

create trigger trg_debt_check_debtor_not_creator
before insert or update on public.debt_expense_items
for each row
execute function public.debt_check_debtor_not_creator();

-- =============================================================================
-- Helper: is current user a debtor on this expense?
-- (security definer to avoid recursive RLS evaluation in the SELECT policy)
-- =============================================================================

create or replace function public.is_debt_expense_debtor(expense_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.debt_expense_items
    where expense_id = expense_uuid and debtor_id = auth.uid()
  );
$$;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.debt_expenses      enable row level security;
alter table public.debt_expense_items enable row level security;
alter table public.debt_settlements   enable row level security;

-- debt_expenses: creator full CRUD; debtor read-only.
create policy "debt_expenses_select" on public.debt_expenses
for select using (creator_id = auth.uid() or public.is_debt_expense_debtor(id));

create policy "debt_expenses_insert" on public.debt_expenses
for insert with check (creator_id = auth.uid());

create policy "debt_expenses_update" on public.debt_expenses
for update using (creator_id = auth.uid());

create policy "debt_expenses_delete" on public.debt_expenses
for delete using (creator_id = auth.uid());

-- debt_expense_items: debtor reads their own row; creator full CRUD on their expense's items.
create policy "debt_expense_items_select" on public.debt_expense_items
for select using (
  debtor_id = auth.uid()
  or expense_id in (select id from public.debt_expenses where creator_id = auth.uid())
);

create policy "debt_expense_items_insert" on public.debt_expense_items
for insert with check (
  expense_id in (select id from public.debt_expenses where creator_id = auth.uid())
);

create policy "debt_expense_items_update" on public.debt_expense_items
for update using (
  expense_id in (select id from public.debt_expenses where creator_id = auth.uid())
);

create policy "debt_expense_items_delete" on public.debt_expense_items
for delete using (
  expense_id in (select id from public.debt_expenses where creator_id = auth.uid())
);

-- debt_settlements: involved users can read; writes only via RPC (no INSERT/UPDATE/DELETE policy).
create policy "debt_settlements_select" on public.debt_settlements
for select using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- =============================================================================
-- RPC: expense create / update / mark item paid (creator-scoped writes)
-- =============================================================================

create or replace function public.debt_create_expense(
  p_name text,
  p_description text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_item jsonb;
begin
  insert into public.debt_expenses (creator_id, name, description)
  values (auth.uid(), p_name, p_description)
  returning id into v_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.debt_expense_items (expense_id, debtor_id, amount)
    values (
      v_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  end loop;

  return v_expense_id;
end;
$$;

create or replace function public.debt_update_expense(
  p_expense_id uuid,
  p_name text,
  p_description text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if not exists (select 1 from public.debt_expenses where id = p_expense_id and creator_id = auth.uid()) then
    raise exception 'expense not found or not authorized';
  end if;

  update public.debt_expenses set name = p_name, description = p_description where id = p_expense_id;

  delete from public.debt_expense_items where expense_id = p_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.debt_expense_items (expense_id, debtor_id, amount)
    values (
      p_expense_id,
      (v_item->>'debtor_id')::uuid,
      (v_item->>'amount')::numeric
    );
  end loop;
end;
$$;

create or replace function public.debt_mark_item_paid(
  p_item_id uuid,
  p_paid boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.debt_expense_items ei
  set paid_at = case when p_paid then now() else null end
  from public.debt_expenses e
  where ei.id = p_item_id
    and ei.expense_id = e.id
    and e.creator_id = auth.uid();
end;
$$;

-- =============================================================================
-- RPC: settlement confirmation (only the involved party can confirm)
-- =============================================================================

create or replace function public.debt_confirm_settlement_from(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.debt_settlements
  set
    from_confirmed = true,
    settled_at = case when to_confirmed = true then now() else settled_at end
  where id = p_settlement_id and from_user_id = auth.uid();

  if not found then
    raise exception 'settlement not found or not authorized';
  end if;
end;
$$;

create or replace function public.debt_confirm_settlement_to(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.debt_settlements
  set
    to_confirmed = true,
    settled_at = case when from_confirmed = true then now() else settled_at end
  where id = p_settlement_id and to_user_id = auth.uid();

  if not found then
    raise exception 'settlement not found or not authorized';
  end if;
end;
$$;

-- =============================================================================
-- RPC: monthly cron — generate settlement rows from the previous month's nets
-- =============================================================================

create or replace function public.debt_generate_monthly_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  v_period       := to_char(now() - interval '1 month', 'YYYY-MM');
  v_period_start := date_trunc('month', now() - interval '1 month');
  v_period_end   := date_trunc('month', now());

  insert into public.debt_settlements (period, from_user_id, to_user_id, amount)
  select v_period, from_user, to_user, net_amount
  from (
    select
      case when net_a_to_b > 0 then user_b else user_a end as from_user,
      case when net_a_to_b > 0 then user_a else user_b end as to_user,
      abs(net_a_to_b) as net_amount
    from (
      select
        least(e.creator_id, ei.debtor_id) as user_a,
        greatest(e.creator_id, ei.debtor_id) as user_b,
        sum(
          case
            when e.creator_id = least(e.creator_id, ei.debtor_id) then ei.amount
            else -ei.amount
          end
        ) as net_a_to_b
      from public.debt_expense_items ei
      join public.debt_expenses e on e.id = ei.expense_id
      where e.created_at >= v_period_start
        and e.created_at <  v_period_end
      group by least(e.creator_id, ei.debtor_id), greatest(e.creator_id, ei.debtor_id)
    ) paired
    where net_a_to_b <> 0
  ) settlements
  on conflict (period, from_user_id, to_user_id) do nothing;
end;
$$;

-- =============================================================================
-- Data migration: copy existing debit_* rows into debt_* (preserves IDs)
-- =============================================================================

insert into public.debt_expenses (id, creator_id, name, description, created_at)
select id, creator_id, name, description, created_at
from public.debit_expenses;

insert into public.debt_expense_items (id, expense_id, debtor_id, amount, paid_at, created_at)
select id, expense_id, debtor_id, amount, paid_at, created_at
from public.debit_expense_items;

insert into public.debt_settlements (
  id, period, from_user_id, to_user_id, amount,
  from_confirmed, to_confirmed, settled_at, created_at
)
select
  id, period, from_user_id, to_user_id, amount,
  from_confirmed, to_confirmed, settled_at, created_at
from public.debit_settlements;
