-- Seed a 加料 (add-on) option group for the 八曜和茶 drink shop.
--
-- Unlike 甜度/冰量, this group is optional (required=false) and multi-select
-- (single_select=false) — customers can pick any number of add-ons, each
-- carrying a price_delta that add-order-item-dialog.tsx surfaces as "+$N"
-- and the order/list totals fold into the item price.
--
-- Matched by id, not name: the shop has since been renamed to
-- "八曜和茶 新竹東區清大門市" (was "八曜和茶" when it was first seeded).

do $$
declare
  v_rid uuid := 'a6867ebb-4f02-44b1-9ae3-1832eeb9cfb8';
  v_addon uuid;
begin
  if exists (select 1 from public.bento_menus where id = v_rid and kind = 'drinks')
    and not exists (select 1 from public.bento_option_groups where restaurant_id = v_rid and name = '加料')
  then
    insert into public.bento_option_groups (restaurant_id, name, required, single_select, sort_order)
    values (v_rid, '加料', false, false, 3)
    returning id into v_addon;
    insert into public.bento_option_values (group_id, label, price_delta, sort_order) values
      (v_addon, '蜜漬白玉丸', 10, 1),
      (v_addon, '儿儿益生菌', 25, 2);
  end if;
end $$;
