-- Drink-shop support for bento, with a NORMALIZED per-restaurant option model.
--
-- Motivation: the existing customization is denormalized — bento_menus.additional
-- is a jsonb string array (one implicit single-select group) chosen per item via
-- bento_order_items.additional (int index), plus a hardcoded no_sauce boolean.
-- Drink shops need mandatory 甜度/冰量, which shouldn't be stuffed into more jsonb.
--
-- Model:
--   * bento_menus.kind ('meal' | 'drinks') marks a restaurant as a drink shop.
--   * bento_option_groups: named option groups per restaurant (e.g. 甜度, 冰量),
--     each required? and single_select?
--   * bento_option_values: the choices in a group (無糖, 1分糖, 去冰, ...).
--   * bento_order_item_options: which values an order item selected (M:N).
-- Mandatory groups are enforced in add_bento_order_item() (DB-level), not just UI.
--
-- RLS mirrors the existing bento tables: option groups/values are world-readable
-- and admin-writable; selections are world-readable but only writable through the
-- SECURITY DEFINER RPC (no direct INSERT policy), which is what enforces "required".

-- 1. Restaurant kind ------------------------------------------------------------
alter table public.bento_menus
  add column if not exists kind text not null default 'meal'
  check (kind in ('meal', 'drinks'));

-- 2. Normalized option tables ---------------------------------------------------
create table if not exists public.bento_option_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.bento_menus(id) on delete cascade,
  name          text not null,
  required      boolean not null default false,
  single_select boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.bento_option_values (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.bento_option_groups(id) on delete cascade,
  label      text not null,
  price_delta numeric not null default 0,
  sort_order int not null default 0
);

create table if not exists public.bento_order_item_options (
  order_item_id   uuid not null references public.bento_order_items(id) on delete cascade,
  option_value_id uuid not null references public.bento_option_values(id) on delete cascade,
  primary key (order_item_id, option_value_id)
);

create index if not exists bento_option_groups_restaurant_idx
  on public.bento_option_groups (restaurant_id);
create index if not exists bento_option_values_group_idx
  on public.bento_option_values (group_id);
create index if not exists bento_order_item_options_value_idx
  on public.bento_order_item_options (option_value_id);

-- 3. RLS ------------------------------------------------------------------------
alter table public.bento_option_groups enable row level security;
alter table public.bento_option_values enable row level security;
alter table public.bento_order_item_options enable row level security;

-- Option groups: world-readable, admin-writable (mirror bento_menu_items).
create policy "Anyone can view option groups"
  on public.bento_option_groups for select using (true);
create policy "Admins can manage option groups"
  on public.bento_option_groups for all
  using (has_role(auth.uid(), 'bento', 'admin'))
  with check (has_role(auth.uid(), 'bento', 'admin'));

create policy "Anyone can view option values"
  on public.bento_option_values for select using (true);
create policy "Admins can manage option values"
  on public.bento_option_values for all
  using (has_role(auth.uid(), 'bento', 'admin'))
  with check (has_role(auth.uid(), 'bento', 'admin'));

-- Selections: world-readable; NO direct write policy on purpose — only the
-- SECURITY DEFINER RPC below (and service_role) may insert, so "required groups
-- must be selected" cannot be bypassed by a direct client insert. Deletes happen
-- via ON DELETE CASCADE when the parent order item is removed.
create policy "Anyone can view order item options"
  on public.bento_order_item_options for select using (true);

-- 4. Atomic add-with-options RPC ------------------------------------------------
-- Replaces the three direct-insert paths for drink orders: inserts the order item
-- and its option selections in one transaction, and validates that every required
-- option group for the item's restaurant is satisfied. Re-implements the identity
-- checks that the bento_order_items INSERT policies enforce (self / anon / admin).
create or replace function public.add_bento_order_item(
  p_order_id          text,
  p_menu_item_id      uuid,
  p_option_value_ids  uuid[] default '{}',
  p_no_sauce          boolean default false,
  p_user_id           uuid default null,
  p_anonymous_name    text default null,
  p_anonymous_contact text default null
)
returns bento_order_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_rid     uuid;
  v_missing text;
  v_item    public.bento_order_items;
begin
  -- Order must exist and be open.
  select restaurant_id into v_rid
  from public.bento_orders where id = p_order_id and status = 'active';
  if v_rid is null then
    raise exception '訂單不存在或已關閉' using errcode = 'P0001';
  end if;

  -- Menu item must belong to this order's restaurant.
  if not exists (
    select 1 from public.bento_menu_items
    where id = p_menu_item_id and restaurant_id = v_rid
  ) then
    raise exception '品項不屬於此訂單的店家' using errcode = 'P0001';
  end if;

  -- Every provided option value must belong to a group of this restaurant.
  if exists (
    select 1 from unnest(p_option_value_ids) as sel(vid)
    left join public.bento_option_values ov on ov.id = sel.vid
    left join public.bento_option_groups og on og.id = ov.group_id
    where ov.id is null or og.restaurant_id is distinct from v_rid
  ) then
    raise exception '選項不合法' using errcode = 'P0001';
  end if;

  -- Every required group must have at least one selected value.
  select string_agg(og.name, '、' order by og.sort_order) into v_missing
  from public.bento_option_groups og
  where og.restaurant_id = v_rid
    and og.required
    and not exists (
      select 1 from unnest(p_option_value_ids) as sel(vid)
      join public.bento_option_values ov on ov.id = sel.vid
      where ov.group_id = og.id
    );
  if v_missing is not null then
    raise exception '請選擇：%', v_missing using errcode = 'P0001';
  end if;

  -- Identity: mirror the bento_order_items INSERT policies.
  if v_uid is null then
    if p_anonymous_name is null or btrim(p_anonymous_name) = ''
       or p_anonymous_contact is null or btrim(p_anonymous_contact) = '' then
      raise exception '匿名點餐需填姓名與聯絡方式' using errcode = 'P0001';
    end if;
    insert into public.bento_order_items
      (order_id, menu_item_id, user_id, no_sauce, anonymous_name, anonymous_contact)
    values
      (p_order_id, p_menu_item_id, null, coalesce(p_no_sauce, false),
       btrim(p_anonymous_name), btrim(p_anonymous_contact))
    returning * into v_item;
  elsif p_user_id is not null and p_user_id <> v_uid then
    if not has_role(v_uid, 'bento', 'admin') then
      raise exception 'Forbidden: 僅管理員可代點' using errcode = 'P0001';
    end if;
    insert into public.bento_order_items (order_id, menu_item_id, user_id, no_sauce)
    values (p_order_id, p_menu_item_id, p_user_id, coalesce(p_no_sauce, false))
    returning * into v_item;
  else
    insert into public.bento_order_items (order_id, menu_item_id, user_id, no_sauce)
    values (p_order_id, p_menu_item_id, v_uid, coalesce(p_no_sauce, false))
    returning * into v_item;
  end if;

  -- Record the selections.
  insert into public.bento_order_item_options (order_item_id, option_value_id)
  select v_item.id, sel.vid from unnest(p_option_value_ids) as sel(vid);

  return v_item;
end;
$function$;

grant execute on function public.add_bento_order_item(text, uuid, uuid[], boolean, uuid, text, text)
  to anon, authenticated, service_role;

-- 5. Seed the 八曜和茶 drink shop ------------------------------------------------
do $$
declare
  v_rid   uuid;
  v_sugar uuid;
  v_ice   uuid;
begin
  -- Seeded inactive on purpose: the shop stays hidden from the order-creation
  -- picker (and create_bento_order rejects inactive restaurants) until the
  -- drink-ordering frontend is deployed. Flip is_active = true to launch.
  select id into v_rid from public.bento_menus where name = '八曜和茶' and kind = 'drinks';
  if v_rid is null then
    insert into public.bento_menus (name, phone, kind, is_active)
    values ('八曜和茶', '', 'drinks', false)
    returning id into v_rid;
  end if;

  -- Menu items (only seed once).
  if not exists (select 1 from public.bento_menu_items where restaurant_id = v_rid) then
    insert into public.bento_menu_items (restaurant_id, name, price, type) values
      (v_rid, '八曜和茶', 35, '和風茶'),
      (v_rid, '和風308', 50, '和風茶'),
      (v_rid, '83蜂凝露', 55, '和風茶'),
      (v_rid, '和風307', 50, '和風日式複方茶'),
      (v_rid, '究極308', 42, '和風日式複方茶'),
      (v_rid, '朝日覺醒紅茶', 40, '和風日式複方茶'),
      (v_rid, '83蜂見茶', 60, '和風日式複方茶'),
      (v_rid, '極上307', 37, '自然茶'),
      (v_rid, '舞伎406紅茶', 46, '自然茶'),
      (v_rid, '大地覺醒紅茶', 35, '自然茶'),
      (v_rid, '明日清爽茶', 35, '自然茶'),
      (v_rid, '焙煎黑烏龍', 35, '自然茶'),
      (v_rid, '茉妃505', 40, '自然茶'),
      (v_rid, '柚香覺醒307', 67, '纖果爽'),
      (v_rid, '柚香覺醒紅茶', 65, '纖果爽'),
      (v_rid, '八曜雙C纖檸露', 50, '纖果爽'),
      (v_rid, '寧夏307', 60, '纖果爽'),
      (v_rid, '明日清爽檸檬茶', 55, '纖果爽'),
      (v_rid, '京楓檸檬紅茶', 50, '纖果爽'),
      (v_rid, '八曜黑檸檬茶', 55, '纖果爽'),
      (v_rid, '83蜂檸爽爽', 65, '纖果爽'),
      (v_rid, '覺醒奶茶', 55, '厚奶茶'),
      (v_rid, '匠心奶茶', 60, '厚奶茶'),
      (v_rid, '深煎黑龍奶茶', 55, '厚奶茶'),
      (v_rid, '京彩舞伎奶茶', 66, '厚奶茶'),
      (v_rid, '冬戀奶茶', 66, '厚奶茶'),
      (v_rid, '308炙燒濃乳', 66, '厚奶茶'),
      (v_rid, '83蜂潮奶茶', 69, '厚奶茶'),
      (v_rid, '雪匠奶茶', 69, '厚奶茶'),
      (v_rid, '茉妃雪奶', 60, '厚奶茶'),
      (v_rid, '八曜和風（茶乳）', 55, '鮮乳定製'),
      (v_rid, '八曜和風（乳茶）', 65, '鮮乳定製'),
      (v_rid, '牧場覺醒（茶乳）', 55, '鮮乳定製'),
      (v_rid, '牧場覺醒（乳茶）', 65, '鮮乳定製'),
      (v_rid, '牧場黑烏龍（茶乳）', 60, '鮮乳定製'),
      (v_rid, '牧場黑烏龍（乳茶）', 70, '鮮乳定製'),
      (v_rid, '牧場307（茶乳）', 65, '鮮乳定製'),
      (v_rid, '牧場307（乳茶）', 75, '鮮乳定製'),
      (v_rid, '牧場308（茶乳）', 65, '鮮乳定製'),
      (v_rid, '牧場308（乳茶）', 75, '鮮乳定製'),
      (v_rid, '贅澤香焙歐蕾', 66, '鮮乳定製'),
      (v_rid, '茉妃牧場505（茶乳）', 65, '鮮乳定製'),
      (v_rid, '茉妃牧場505（乳茶）', 75, '鮮乳定製'),
      (v_rid, '8YO極韻白奶茶', 79, '極韻白奶茶'),
      (v_rid, '308極韻白奶茶', 79, '極韻白奶茶'),
      (v_rid, '307極韻白奶茶', 89, '極韻白奶茶'),
      (v_rid, '406極韻白奶茶', 89, '極韻白奶茶'),
      (v_rid, '茉心極韻白奶茶', 89, '極韻白奶茶'),
      (v_rid, '樂多307', 70, '乳酸樂多'),
      (v_rid, '樂多308', 70, '乳酸樂多'),
      (v_rid, '八曜樂多', 60, '乳酸樂多'),
      (v_rid, '明日樂多', 60, '乳酸樂多'),
      (v_rid, '茉語樂多', 70, '乳酸樂多');
  end if;

  -- 甜度 (required, single-select).
  if not exists (select 1 from public.bento_option_groups where restaurant_id = v_rid and name = '甜度') then
    insert into public.bento_option_groups (restaurant_id, name, required, single_select, sort_order)
    values (v_rid, '甜度', true, true, 1)
    returning id into v_sugar;
    insert into public.bento_option_values (group_id, label, sort_order) values
      (v_sugar, '無糖', 1),
      (v_sugar, '1分糖', 2),
      (v_sugar, '3分糖', 3),
      (v_sugar, '5分糖', 4),
      (v_sugar, '8分糖（全糖）', 5);
  end if;

  -- 冰量 (required, single-select).
  if not exists (select 1 from public.bento_option_groups where restaurant_id = v_rid and name = '冰量') then
    insert into public.bento_option_groups (restaurant_id, name, required, single_select, sort_order)
    values (v_rid, '冰量', true, true, 2)
    returning id into v_ice;
    insert into public.bento_option_values (group_id, label, sort_order) values
      (v_ice, '熱', 1),
      (v_ice, '溫', 2),
      (v_ice, '完全去冰', 3),
      (v_ice, '去冰五顆冰', 4),
      (v_ice, '35%冰', 5);
  end if;
end $$;
