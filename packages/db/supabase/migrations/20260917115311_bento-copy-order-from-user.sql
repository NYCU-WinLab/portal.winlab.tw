-- "跟他一樣" — replace my items in an order with a copy of someone else's (#1131).
--
-- Why an RPC and not a client-side delete-then-insert loop:
--
--   1. bento_order_item_options deliberately has NO insert policy (see
--      20260703050939): option picks may only be written by a SECURITY DEFINER
--      function, which is what stops a client from bypassing "required groups".
--      A copy that carries 甜度/冰量 therefore cannot be done from the browser
--      at all.
--   2. The semantics are *overwrite*, so the delete and the inserts have to
--      share a transaction. A client loop that deletes my four items and then
--      fails on the second insert leaves me with a half-order — or none — and
--      no way to tell which.
--
-- Scope: copies only from a logged-in member's items to the caller's own.
-- Anonymous (guest) entries are identified by a free-text name, not an id, so
-- they are not a copy source; /bento is auth-gated and the anon insert path is
-- revoked (20260810015044), so those rows are legacy.
--
-- What is copied: menu_item_id, no_sauce, additional, and every option pick.
-- created_at is NOT copied — the copies are new rows and read as "ordered now"
-- in the 依時間 view, which is the truth.
--
-- Returns the number of lines copied, not the rows: the client refetches the
-- order anyway (the realtime/query invalidation path), and it only needs the
-- count to word the toast.

create or replace function public.copy_bento_order_from_user(
  p_order_id       text,
  p_source_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_source public.bento_order_items;
  v_copy_id uuid;
  v_count  integer := 0;
begin
  if v_uid is null then
    raise exception '請先登入' using errcode = 'P0001';
  end if;

  if p_source_user_id is null or p_source_user_id = v_uid then
    raise exception '不能複製自己的訂餐' using errcode = 'P0001';
  end if;

  -- Order must exist and still be open. Lock it so a concurrent close (or a
  -- second copy from another tab) can't interleave with the delete + inserts.
  perform 1
  from public.bento_orders
  where id = p_order_id and status = 'active'
  for update;

  if not found then
    raise exception '訂單不存在或已關閉' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.bento_order_items
    where order_id = p_order_id and user_id = p_source_user_id
  ) then
    raise exception '對方在此訂單沒有訂餐' using errcode = 'P0001';
  end if;

  -- Overwrite: drop whatever I had first. Option picks go with it via
  -- bento_order_item_options' ON DELETE CASCADE.
  delete from public.bento_order_items
  where order_id = p_order_id and user_id = v_uid;

  -- Row at a time so each copy's option picks can be attached to the row they
  -- came from. A member orders a handful of items, so the loop cost is noise
  -- next to the set-based version's need to re-pair inserted rows to sources.
  for v_source in
    select * from public.bento_order_items
    where order_id = p_order_id and user_id = p_source_user_id
    order by created_at, id
  loop
    insert into public.bento_order_items
      (order_id, menu_item_id, user_id, no_sauce, additional)
    values
      (p_order_id, v_source.menu_item_id, v_uid, v_source.no_sauce,
       v_source.additional)
    returning id into v_copy_id;

    insert into public.bento_order_item_options (order_item_id, option_value_id)
    select v_copy_id, o.option_value_id
    from public.bento_order_item_options o
    where o.order_item_id = v_source.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- `alter default privileges` in this project hands anon/authenticated/
-- service_role EXECUTE on every new function in public, so anon has to be
-- revoked explicitly — a bare `revoke from public` would not touch it.
-- /bento is behind the portal auth gate and this RPC is meaningless without
-- auth.uid(), matching the anon lockdown in 20260810015044.
revoke execute on function public.copy_bento_order_from_user(text, uuid) from anon;
grant execute on function public.copy_bento_order_from_user(text, uuid)
  to authenticated, service_role;
