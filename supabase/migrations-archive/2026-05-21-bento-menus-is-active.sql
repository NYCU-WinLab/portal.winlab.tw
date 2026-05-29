-- Soft-disable for bento restaurants: add an is_active flag so admins can
-- "ban" a restaurant without deleting it. Deleting would break the foreign
-- key from bento_orders.restaurant_id and erase historical orders.
--
-- After this migration:
--   * Clients that filter is_active = true hide disabled restaurants from
--     "new order" pickers and the public /bento/menus list.
--   * The create_bento_order RPC rejects disabled restaurants at the server
--     so a stale client (or direct API call) cannot bypass the filter.
--   * Existing orders for a now-disabled restaurant continue to work — the
--     row is still there, only the flag changed.

-- 1. Soft-disable flag. Defaults to true so existing 10 restaurants stay active.
alter table public.bento_menus
  add column if not exists is_active boolean not null default true;

-- 2. Partial index on the hot path (active restaurants).
create index if not exists bento_menus_is_active_idx
  on public.bento_menus (is_active)
  where is_active = true;

-- 3. Reject disabled restaurants inside create_bento_order. Guard sits after
--    the admin check so the "disabled" message never leaks to non-admins, and
--    before the duplicate-id check so the error message is the most relevant.
create or replace function public.create_bento_order(
  p_restaurant_id uuid,
  p_order_date    date,
  p_auto_close_at timestamp with time zone default null::timestamp with time zone
)
returns bento_orders
language plpgsql
security definer
as $function$
declare
  v_order_id text;
  v_order    bento_orders;
begin
  -- Check admin
  if not has_role(auth.uid(), 'bento', 'admin') then
    raise exception 'Forbidden: Admin access required';
  end if;

  -- Reject disabled restaurants
  if not exists (
    select 1 from public.bento_menus
    where id = p_restaurant_id and is_active = true
  ) then
    raise exception '店家已停用，無法建立訂單' using errcode = 'P0001';
  end if;

  -- Generate date-based ID
  v_order_id := to_char(p_order_date, 'YYYYMMDD');

  -- Check duplicate
  if exists (select 1 from bento_orders where id = v_order_id) then
    raise exception '日期 % 已經有訂單了，請使用現有的訂單', v_order_id;
  end if;

  -- Insert
  insert into bento_orders (id, restaurant_id, status, created_by, auto_close_at)
  values (v_order_id, p_restaurant_id, 'active', auth.uid(), p_auto_close_at)
  returning * into v_order;

  return v_order;
end;
$function$;
