"use client"

import type { ReactElement } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

interface OrderItemForStats {
  menu_item_id: string
  no_sauce?: boolean
  additional?: number | null
  menu_items: {
    name: string
    price: number
  }
  user_id: string | null
  anonymous_name?: string | null
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
      combinations: Map<string, number>
    }
  >()

  items.forEach((item) => {
    const menuItemId = item.menu_item_id
    const menuItemName = item.menu_items?.name || "未知品項"
    const menuItemPrice = item.menu_items?.price || 0

    const combinationKey = `noSauce:${item.no_sauce || false},additional:${
      item.additional !== null && item.additional !== undefined
        ? item.additional
        : null
    }`

    if (menuItemCounts.has(menuItemId)) {
      const existing = menuItemCounts.get(menuItemId)!
      existing.totalCount += 1
      const currentCount = existing.combinations.get(combinationKey) || 0
      existing.combinations.set(combinationKey, currentCount + 1)
    } else {
      const combinations = new Map<string, number>()
      combinations.set(combinationKey, 1)
      menuItemCounts.set(menuItemId, {
        name: menuItemName,
        price: menuItemPrice,
        totalCount: 1,
        combinations,
      })
    }
  })

  const totalPrice = items.reduce(
    (sum, item) => sum + (item.menu_items?.price || 0),
    0
  )

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
                .sort((a, b) => b[1] - a[1])
                .map(([combinationKey, count]) => {
                  const [noSaucePart = "", additionalPart = ""] =
                    combinationKey.split(",")
                  const noSauce = noSaucePart.split(":")[1] === "true"
                  const additionalStr = additionalPart.split(":")[1] ?? "null"
                  const additional =
                    additionalStr === "null" ? null : parseInt(additionalStr)

                  const options: string[] = []
                  if (noSauce) options.push("不醬")
                  if (
                    additional !== null &&
                    restaurantAdditional &&
                    restaurantAdditional[additional]
                  ) {
                    options.push(restaurantAdditional[additional])
                  }

                  if (options.length > 0) {
                    return (
                      <span
                        key={combinationKey}
                        className="ml-1 text-[11px] text-muted-foreground"
                      >
                        （{options.join(" ")} {count} 份）
                      </span>
                    )
                  }
                  return null
                })
                .filter((item): item is ReactElement => item !== null)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
