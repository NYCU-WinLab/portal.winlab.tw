import type { SupabaseClient } from "@supabase/supabase-js"

export interface OrderItemRow {
  id: string
  order_id: string
  menu_item_id: string
  user_id: string | null
  no_sauce: boolean | null
  additional: number | null
  anonymous_name: string | null
  anonymous_contact: string | null
  created_at: string | null
}

export interface AddOrderItemWithOptionsParams {
  order_id: string
  menu_item_id: string
  option_value_ids: string[]
  no_sauce?: boolean
  user_id?: string | null
  anonymous_name?: string | null
  anonymous_contact?: string | null
}

// Adds an order item together with its selected options (e.g. 甜度/冰量) in one
// atomic RPC. The RPC enforces that the order is still open, that the item
// belongs to its restaurant and that every required option group is satisfied,
// so mandatory ice/sugar cannot be bypassed. Shared by the browser hook and the
// MCP add_bento_order_item tool so both writers produce identical rows.
export async function addOrderItemWithOptions(
  supabase: SupabaseClient,
  params: AddOrderItemWithOptionsParams
): Promise<OrderItemRow> {
  const { data, error } = await supabase.rpc("add_bento_order_item", {
    p_order_id: params.order_id,
    p_menu_item_id: params.menu_item_id,
    p_option_value_ids: params.option_value_ids,
    p_no_sauce: params.no_sauce ?? false,
    p_user_id: params.user_id ?? undefined,
    p_anonymous_name: params.anonymous_name ?? undefined,
    p_anonymous_contact: params.anonymous_contact ?? undefined,
  })

  if (error) throw error
  return data as OrderItemRow
}

// Deletes one order item and reports how many rows went. RLS lets a member
// delete only their own line (bento admins any), so a 0 here is a permission
// answer, not an error.
export async function deleteOrderItem(
  supabase: SupabaseClient,
  itemId: string,
  options: { ownerId?: string } = {}
): Promise<number> {
  let query = supabase.from("bento_order_items").delete().eq("id", itemId)
  // RLS lets a bento admin delete anyone's line. A caller that must stay
  // self-only (the MCP tool) narrows the delete to its own rows here.
  if (options.ownerId) query = query.eq("user_id", options.ownerId)
  const { data, error } = await query.select("id")

  if (error) throw error
  return ((data ?? []) as { id: string }[]).length
}
