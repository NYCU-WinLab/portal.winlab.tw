-- Allow more than one bento order per calendar day.
--
-- Until now bento_orders.id was the order date itself (TO_CHAR(date,
-- 'YYYYMMDD')), so create_bento_order raised "日期 X 已經有訂單了" on the second
-- order of a day. That made "two restaurants / two batches on the same day"
-- impossible.
--
-- After this migration:
--   * bento_orders gains an order_date column (backfilled from the legacy id)
--     so the UI can show the real date without parsing the id — the id is now
--     free to carry a disambiguating suffix.
--   * The first order of a day keeps the plain id (YYYYMMDD) for backward
--     compatibility; the 2nd, 3rd, ... get "YYYYMMDD-2", "YYYYMMDD-3", ...
--   * The id stays TEXT, so the bento_order_items.order_id foreign key and all
--     existing rows are untouched.

-- 1. Real date column. Nullable while we backfill, NOT NULL afterwards.
alter table public.bento_orders
  add column if not exists order_date date;

-- 2. Backfill from the legacy date-based id (all existing ids are 8 digits).
update public.bento_orders
set order_date = to_date(left(id, 8), 'YYYYMMDD')
where order_date is null
  and id ~ '^\d{8}';

-- 3. Lock it down once every row has a date.
alter table public.bento_orders
  alter column order_date set not null;

-- 4. Index for date-based lookups / sorting.
create index if not exists bento_orders_order_date_idx
  on public.bento_orders (order_date);

-- 5. create_bento_order: no longer rejects a duplicate day. Instead it finds
--    the next free id for that date and stamps order_date. The loop retries on
--    the (rare) concurrent-insert race so two admins creating orders for the
--    same day at once can't collide on the primary key.
create or replace function public.create_bento_order(
  p_restaurant_id uuid,
  p_order_date    date,
  p_auto_close_at timestamp with time zone default null::timestamp with time zone
)
returns bento_orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base     text;
  v_order_id text;
  v_suffix   int := 1;
  v_order    public.bento_orders;
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

  v_base := to_char(p_order_date, 'YYYYMMDD');

  -- Try the plain date id first, then -2, -3, ... Retry on a concurrent insert
  -- that grabbed the same id between our check and our insert.
  loop
    -- Pick the next candidate id that is not currently taken.
    v_order_id := v_base;
    v_suffix := 1;
    while exists (select 1 from public.bento_orders where id = v_order_id) loop
      v_suffix := v_suffix + 1;
      v_order_id := v_base || '-' || v_suffix;
    end loop;

    begin
      insert into public.bento_orders
        (id, restaurant_id, status, created_by, auto_close_at, order_date)
      values
        (v_order_id, p_restaurant_id, 'active', auth.uid(), p_auto_close_at, p_order_date)
      returning * into v_order;
      return v_order;
    exception when unique_violation then
      -- Someone else took v_order_id first; recompute and try again.
    end;
  end loop;
end;
$function$;
