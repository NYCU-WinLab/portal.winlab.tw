-- Profile stats: per-app aggregations exposed via SECURITY DEFINER RPCs so
-- the profile page makes exactly one round-trip instead of N. Each sub-
-- function self-gates on auth.uid() = p_user_id; passing someone else's
-- uid silently returns zeros — no privilege escalation, no info leak
-- (zero stats look the same as "user exists but never used the app").
--
-- New apps wire in by adding a sibling function and one entry in
-- get_profile_stats(). Decentralised authorship, single round-trip.

create or replace function public.bento_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      mi.id    as menu_item_id,
      mi.name  as menu_item_name,
      mi.price as price
    from public.bento_order_items oi
    join public.bento_menu_items mi on mi.id = oi.menu_item_id
    where oi.user_id = p_user_id
      and auth.uid() = p_user_id
  ),
  totals as (
    select
      count(*)::int                      as total_orders,
      coalesce(sum(price), 0)::int       as total_spent,
      count(distinct menu_item_id)::int  as unique_items
    from mine
  ),
  top_items as (
    select jsonb_agg(
      jsonb_build_object('name', menu_item_name, 'count', cnt)
      order by cnt desc, menu_item_name asc
    ) as items
    from (
      select menu_item_name, count(*)::int as cnt
      from mine
      group by menu_item_name
      order by cnt desc, menu_item_name asc
      limit 3
    ) t
  )
  select jsonb_build_object(
    'total_orders', (select total_orders from totals),
    'total_spent',  (select total_spent  from totals),
    'unique_items', (select unique_items from totals),
    'top_items',    coalesce((select items from top_items), '[]'::jsonb)
  );
$$;

create or replace function public.leave_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select date
    from public.leaves
    where user_id = p_user_id
      and auth.uid() = p_user_id
  )
  select jsonb_build_object(
    'total_days', (select count(*)::int from mine),
    'first_date', (select min(date) from mine)
  );
$$;

create or replace function public.approve_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'created_count', (
      select count(*)::int
      from public.approve_documents
      where created_by = p_user_id
        and auth.uid() = p_user_id
    ),
    'signed_count', (
      select count(*)::int
      from public.approve_signers
      where signer_id = p_user_id
        and status = 'signed'
        and auth.uid() = p_user_id
    ),
    'avg_sign_delay_seconds', (
      select coalesce(
        extract(epoch from avg(signed_at - created_at))::bigint,
        0
      )
      from public.approve_signers
      where signer_id = p_user_id
        and status = 'signed'
        and signed_at is not null
        and auth.uid() = p_user_id
    )
  );
$$;

create or replace function public.trip_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trips_joined', (
      select count(distinct trip_id)::int
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    ),
    'files_uploaded', (
      select count(*)::int
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    ),
    'total_size_bytes', (
      select coalesce(sum(size_bytes), 0)::bigint
      from public.trip_files
      where user_id = p_user_id
        and auth.uid() = p_user_id
    )
  );
$$;

create or replace function public.get_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() = p_user_id then jsonb_build_object(
      'bento',   public.bento_profile_stats(p_user_id),
      'leave',   public.leave_profile_stats(p_user_id),
      'approve', public.approve_profile_stats(p_user_id),
      'trip',    public.trip_profile_stats(p_user_id)
    )
    else null
  end;
$$;

grant execute on function public.bento_profile_stats(uuid)   to authenticated;
grant execute on function public.leave_profile_stats(uuid)   to authenticated;
grant execute on function public.approve_profile_stats(uuid) to authenticated;
grant execute on function public.trip_profile_stats(uuid)    to authenticated;
grant execute on function public.get_profile_stats(uuid)     to authenticated;
