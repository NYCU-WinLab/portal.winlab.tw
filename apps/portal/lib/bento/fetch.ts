import type { SupabaseClient } from "@supabase/supabase-js"

import type { OrderWithStats } from "@/lib/bento/types"

interface OrderItemRaw {
  user_id: string | null
  menu_items?: { name: string; price: number } | null
  bento_order_item_options?: Array<{
    bento_option_values: { price_delta: number } | null
  }> | null
}

function computeOrderStats(orderItems: OrderItemRaw[]) {
  const uniqueUsers = new Set(
    orderItems.map((item) => item.user_id).filter(Boolean)
  )

  const menuItemCounts = new Map<string, { name: string; count: number }>()
  let totalPrice = 0

  for (const item of orderItems) {
    const name = item.menu_items?.name
    const price = parseFloat(String(item.menu_items?.price || 0))
    const optionsPrice = (item.bento_order_item_options ?? []).reduce(
      (sum, opt) => sum + (opt.bento_option_values?.price_delta ?? 0),
      0
    )
    totalPrice += price + optionsPrice

    if (name) {
      const existing = menuItemCounts.get(name)
      if (existing) {
        existing.count += 1
      } else {
        menuItemCounts.set(name, { name, count: 1 })
      }
    }
  }

  return {
    user_count: uniqueUsers.size,
    menu_item_names: Array.from(menuItemCounts.keys()),
    menu_items: Array.from(menuItemCounts.values()),
    total_items: orderItems.length,
    total_price: totalPrice,
  }
}

// Shared by the client hook and the server prefetch — same query + queryKey
// (orders.list) so the page hydrates with real rows from the HTML.
export async function fetchOrders(
  supabase: SupabaseClient
): Promise<OrderWithStats[]> {
  const { data, error } = await supabase
    .from("bento_orders")
    .select(
      "*, restaurants:bento_menus(name, additional), order_items:bento_order_items(*, menu_items:bento_menu_items(name, price), bento_order_item_options(bento_option_values(price_delta)))"
    )
    .order("created_at", { ascending: false })

  if (error) throw error

  return (data || []).map((order) => ({
    ...order,
    stats: computeOrderStats((order.order_items || []) as OrderItemRaw[]),
  })) as unknown as OrderWithStats[]
}
