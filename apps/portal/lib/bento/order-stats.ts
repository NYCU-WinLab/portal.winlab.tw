// Pure aggregation for the OrderStats component. Kept React-free and
// I/O-free so it can be unit-tested directly (see order-stats.test.ts).

export interface StatsOrderItem {
  menu_item_id: string
  no_sauce?: boolean
  additional?: number | null
  selected_options?: {
    group_name: string
    label: string
    price_delta: number
  }[]
  menu_items: {
    name: string
    price: number
  } | null
  user_id: string | null
  anonymous_name?: string | null
}

export interface OrderCombination {
  key: string
  label: string
  count: number
}

export interface MenuItemStat {
  menu_item_id: string
  name: string
  totalCount: number
  combinations: OrderCombination[]
}

export interface OrderStatsResult {
  userCount: number
  itemCount: number
  totalPrice: number
  menuItems: MenuItemStat[]
}

function optionLabel(opt: { label: string; price_delta: number }): string {
  return opt.price_delta > 0 ? `${opt.label} +$${opt.price_delta}` : opt.label
}

// Builds the ordered label parts for one item's option combination:
// drink options first (already group-sorted upstream), then 不醬, then the
// restaurant's additional option.
function combinationParts(
  item: StatsOrderItem,
  restaurantAdditional?: string[] | null
): string[] {
  const parts = (item.selected_options ?? []).map(optionLabel)
  if (item.no_sauce) parts.push("不醬")
  const additionalLabel =
    item.additional !== null && item.additional !== undefined
      ? restaurantAdditional?.[item.additional]
      : undefined
  if (additionalLabel) parts.push(additionalLabel)
  return parts
}

export function computeOrderStats(
  orderItems: StatsOrderItem[] | null | undefined,
  restaurantAdditional?: string[] | null
): OrderStatsResult {
  const items = orderItems ?? []

  const uniqueUsers = new Set(
    items.map(
      (item) => item.user_id ?? `anon:${item.anonymous_name ?? "unknown"}`
    )
  )

  const counts = new Map<
    string,
    {
      name: string
      totalCount: number
      combinations: Map<string, { count: number; label: string }>
    }
  >()

  let totalPrice = 0

  for (const item of items) {
    const menuItemId = item.menu_item_id
    const name = item.menu_items?.name || "未知品項"
    const price = item.menu_items?.price || 0
    const optionsPrice = (item.selected_options ?? []).reduce(
      (sum, opt) => sum + opt.price_delta,
      0
    )
    totalPrice += price + optionsPrice

    const parts = combinationParts(item, restaurantAdditional)
    const key = JSON.stringify(parts)
    const label = parts.join(" · ")

    const existing = counts.get(menuItemId)
    if (existing) {
      existing.totalCount += 1
      const current = existing.combinations.get(key)?.count ?? 0
      existing.combinations.set(key, { count: current + 1, label })
    } else {
      const combinations = new Map<string, { count: number; label: string }>()
      combinations.set(key, { count: 1, label })
      counts.set(menuItemId, { name, totalCount: 1, combinations })
    }
  }

  const menuItems: MenuItemStat[] = Array.from(counts.entries())
    .map(([menu_item_id, value]) => ({
      menu_item_id,
      name: value.name,
      totalCount: value.totalCount,
      combinations: Array.from(value.combinations.entries())
        .map(([key, { count, label }]) => ({ key, label, count }))
        .filter((combo) => combo.label)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name))

  return {
    userCount: uniqueUsers.size,
    itemCount: items.length,
    totalPrice,
    menuItems,
  }
}
