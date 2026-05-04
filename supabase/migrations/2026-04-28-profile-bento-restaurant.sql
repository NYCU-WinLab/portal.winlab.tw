-- bento_profile_stats follow-up: top_items rolled back to a single
-- "本命便當" (top_item) and now includes the restaurant name. The 2nd /
-- 3rd place rows added more noise than signal — one favourite per
-- person hits harder.

create or replace function public.bento_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      mi.id            as menu_item_id,
      mi.name          as menu_item_name,
      r.name           as restaurant_name,
      mi.price         as price
    from public.bento_order_items oi
    join public.bento_menu_items mi on mi.id = oi.menu_item_id
    join public.bento_menus       r  on r.id  = mi.restaurant_id
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
  top_pick as (
    select menu_item_name, restaurant_name, count(*)::int as cnt
    from mine
    group by menu_item_name, restaurant_name
    order by cnt desc, menu_item_name asc
    limit 1
  )
  select jsonb_build_object(
    'total_orders', (select total_orders from totals),
    'total_spent',  (select total_spent  from totals),
    'unique_items', (select unique_items from totals),
    'top_item', (
      select jsonb_build_object(
        'name',            menu_item_name,
        'restaurant_name', restaurant_name,
        'count',           cnt
      )
      from top_pick
    )
  );
$$;
