import type { SupabaseClient } from "@supabase/supabase-js"

import { sortMenuItemsByType } from "@/lib/bento/menu"
import type {
  MenuItem,
  OptionGroup,
  OptionValue,
  Order,
  OrderWithStats,
} from "@/lib/bento/types"

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

interface OptionPickRow {
  order_item_id: string
  option_value_id: string
}

interface OptionValueRow {
  id: string
  group_id: string
  label: string
  price_delta: number
  sort_order: number
}

interface OptionGroupRow {
  id: string
  name: string
  sort_order: number
}

// One order with its restaurant, its items, the display name behind each item
// and the options every item picked. Shared by the detail hook and the MCP
// get_bento_order tool. Options are flat-queried (picks, then values, then
// groups) so typing does not depend on relationship-based nested selects.
export async function fetchOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<Order> {
  const { data, error } = await supabase
    .from("bento_orders")
    .select(
      "*, restaurants:bento_menus(*), order_items:bento_order_items(*, menu_items:bento_menu_items(*))"
    )
    .eq("id", orderId)
    .single()

  if (error) throw error

  const order = data as unknown as Order

  if (order?.order_items) {
    const items = order.order_items
    const userIds = [
      ...new Set(
        items
          .map((item) => item.user_id)
          .filter((id): id is string => id !== null)
      ),
    ]

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", userIds)

      const profileMap = new Map(
        (profiles || []).map((p: { id: string; name: string | null }) => [
          p.id,
          p,
        ])
      )

      order.order_items = items.map((item) => {
        if (item.user_id) {
          const profile = profileMap.get(item.user_id)
          return {
            ...item,
            user: profile ? { name: profile.name || null } : null,
          }
        }
        return {
          ...item,
          user: item.anonymous_name ? { name: item.anonymous_name } : null,
        }
      })
    } else {
      order.order_items = items.map((item) => ({
        ...item,
        user: item.anonymous_name ? { name: item.anonymous_name } : null,
      }))
    }
  }

  if (order?.order_items && order.order_items.length > 0) {
    const enriched = order.order_items
    const itemIds = enriched.map((item) => item.id)
    const { data: pickData } = await supabase
      .from("bento_order_item_options")
      .select("order_item_id, option_value_id")
      .in("order_item_id", itemIds)
    const picks = (pickData ?? []) as OptionPickRow[]

    if (picks.length > 0) {
      const valueIds = [...new Set(picks.map((p) => p.option_value_id))]
      const { data: valueData } = await supabase
        .from("bento_option_values")
        .select("id, label, price_delta, group_id, sort_order")
        .in("id", valueIds)
      const values = (valueData ?? []) as OptionValueRow[]
      const groupIds = [...new Set(values.map((v) => v.group_id))]
      const { data: groupData } = await supabase
        .from("bento_option_groups")
        .select("id, name, sort_order")
        .in("id", groupIds)
      const groups = (groupData ?? []) as OptionGroupRow[]

      const valueMap = new Map(values.map((v) => [v.id, v]))
      const groupMap = new Map(groups.map((g) => [g.id, g]))

      const byItem = new Map<
        string,
        Array<{
          group_name: string
          label: string
          price_delta: number
          group_sort: number
        }>
      >()
      for (const pick of picks) {
        const value = valueMap.get(pick.option_value_id)
        if (!value) continue
        const group = groupMap.get(value.group_id)
        const list = byItem.get(pick.order_item_id) ?? []
        list.push({
          group_name: group?.name ?? "",
          label: value.label,
          price_delta: value.price_delta,
          group_sort: group?.sort_order ?? 0,
        })
        byItem.set(pick.order_item_id, list)
      }

      order.order_items = enriched.map((item) => ({
        ...item,
        selected_options: (byItem.get(item.id) ?? [])
          .sort((a, b) => a.group_sort - b.group_sort)
          .map(({ group_name, label, price_delta }) => ({
            group_name,
            label,
            price_delta,
          })),
      }))
    }
  }

  return order
}

// A restaurant's option groups (e.g. 甜度, 冰量) with their values, ordered the
// way the order form shows them.
export async function fetchOptionGroups(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<OptionGroup[]> {
  const { data, error } = await supabase
    .from("bento_option_groups")
    .select("id, restaurant_id, name, required, single_select, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")

  if (error) throw error
  const groups = (data ?? []) as Omit<OptionGroup, "values">[]
  if (groups.length === 0) return []

  const groupIds = groups.map((g) => g.id)
  const { data: valueData, error: valuesError } = await supabase
    .from("bento_option_values")
    .select("id, group_id, label, price_delta, sort_order")
    .in("group_id", groupIds)
    .order("sort_order")

  if (valuesError) throw valuesError

  const valuesByGroup = new Map<string, OptionValue[]>()
  for (const value of (valueData ?? []) as OptionValue[]) {
    const list = valuesByGroup.get(value.group_id) ?? []
    list.push(value)
    valuesByGroup.set(value.group_id, list)
  }

  return groups.map((group) => ({
    ...group,
    values: valuesByGroup.get(group.id) ?? [],
  }))
}

// A restaurant's menu items, grouped by type and cheapest first inside a type,
// the same order the add-item form lists them in.
export async function fetchMenuItems(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("bento_menu_items")
    .select("id, restaurant_id, name, price, type, created_at")
    .eq("restaurant_id", restaurantId)

  if (error) throw error
  return sortMenuItemsByType((data ?? []) as MenuItem[])
}
