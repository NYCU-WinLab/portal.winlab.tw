"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

interface OrderItemForStats {
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
  }
  user_id: string | null
  anonymous_name?: string | null
}

function optionLabel(opt: { label: string; price_delta: number }): string {
  return opt.price_delta > 0 ? `${opt.label} +$${opt.price_delta}` : opt.label
}

interface OrderStatsProps {
  orderItems: OrderItemForStats[]
  restaurantAdditional?: string[] | null
  className?: string
}

export function OrderStats({
  orderItems,
  restaurantAdditional,
  className,
}: OrderStatsProps) {
  const items = orderItems || []

  const uniqueUsers = new Set(
    items.map(
      (item) => item.user_id ?? `anon:${item.anonymous_name ?? "unknown"}`
    )
  )
  const userCount = uniqueUsers.size

  const menuItemCounts = new Map<
    string,
    {
      name: string
      price: number
      totalCount: number
      combinations: Map<string, { count: number; label: string }>
    }
  >()

  items.forEach((item) => {
    const menuItemId = item.menu_item_id
    const menuItemName = item.menu_items?.name || "未知品項"
    const menuItemPrice = item.menu_items?.price || 0

    const parts = (item.selected_options ?? []).map(optionLabel)
    if (item.no_sauce) parts.push("不醬")
    const additionalLabel =
      item.additional !== null && item.additional !== undefined
        ? restaurantAdditional?.[item.additional]
        : undefined
    if (additionalLabel) parts.push(additionalLabel)

    const combinationKey = JSON.stringify(parts)
    const combinationLabel = parts.join(" ")

    if (menuItemCounts.has(menuItemId)) {
      const existing = menuItemCounts.get(menuItemId)!
      existing.totalCount += 1
      const currentCount = existing.combinations.get(combinationKey)?.count ?? 0
      existing.combinations.set(combinationKey, {
        count: currentCount + 1,
        label: combinationLabel,
      })
    } else {
      const combinations = new Map<string, { count: number; label: string }>()
      combinations.set(combinationKey, { count: 1, label: combinationLabel })
      menuItemCounts.set(menuItemId, {
        name: menuItemName,
        price: menuItemPrice,
        totalCount: 1,
        combinations,
      })
    }
  })

  const totalPrice = items.reduce((sum, item) => {
    const optionsPrice = (item.selected_options ?? []).reduce(
      (s, opt) => s + opt.price_delta,
      0
    )
    return sum + (item.menu_items?.price || 0) + optionsPrice
  }, 0)

  const menuItemsList = Array.from(menuItemCounts.values()).sort(
    (a, b) => b.totalCount - a.totalCount
  )

  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-sm text-muted-foreground",
        className
      )}
    >
      <p>
        已有 <span className="font-medium text-foreground">{userCount}</span>{" "}
        人訂餐，
        <span className="font-medium text-foreground">{items.length}</span>{" "}
        項餐點，共 NT${" "}
        <span className="font-medium text-foreground">
          {totalPrice.toLocaleString()}
        </span>
      </p>
      {menuItemsList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {menuItemsList.map((item, index) => (
            <Badge
              key={index}
              variant="outline"
              className="px-2 py-0.5 text-xs"
            >
              {item.name} <span className="font-medium">{item.totalCount}</span>{" "}
              份
              {Array.from(item.combinations.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .map(([combinationKey, { count, label }]) =>
                  label ? (
                    <span
                      key={combinationKey}
                      className="ml-1 text-[11px] text-muted-foreground"
                    >
                      （{label} {count} 份）
                    </span>
                  ) : null
                )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
