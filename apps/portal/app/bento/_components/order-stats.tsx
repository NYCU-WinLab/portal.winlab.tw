"use client"

import { cn } from "@workspace/ui/lib/utils"

import { computeOrderStats, type StatsOrderItem } from "@/lib/bento/order-stats"

interface OrderStatsProps {
  orderItems: StatsOrderItem[]
  restaurantAdditional?: string[] | null
  variant?: "full" | "compact"
  className?: string
}

export function OrderStats({
  orderItems,
  restaurantAdditional,
  variant = "full",
  className,
}: OrderStatsProps) {
  const { userCount, itemCount, totalPrice, menuItems } = computeOrderStats(
    orderItems,
    restaurantAdditional
  )

  if (variant === "compact") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        <span className="font-medium text-foreground">{userCount}</span> 人
        {" · "}
        <span className="font-medium text-foreground">{itemCount}</span> 項
        {" · "}
        <span className="font-medium text-foreground tabular-nums">
          NT$ {totalPrice.toLocaleString()}
        </span>
      </p>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={userCount.toLocaleString()} label="人訂餐" />
        <StatTile value={itemCount.toLocaleString()} label="項餐點" />
        <StatTile
          value={totalPrice.toLocaleString()}
          prefix="NT$"
          label="總計"
        />
      </div>

      {menuItems.length > 0 && (
        <ul className="flex flex-col gap-3">
          {menuItems.map((item) => (
            <li key={item.menu_item_id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                  ×{item.totalCount}
                </span>
              </div>
              {item.combinations.length > 0 && (
                <ul className="flex flex-col gap-1 border-l border-border pl-3">
                  {item.combinations.map((combo) => (
                    <li
                      key={combo.key}
                      className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground"
                    >
                      <span>{combo.label}</span>
                      <span className="shrink-0 tabular-nums">
                        ×{combo.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatTile({
  value,
  prefix,
  label,
}: {
  value: string
  prefix?: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-3">
      <span className="text-xl font-semibold text-foreground tabular-nums sm:text-2xl">
        {prefix && (
          <span className="mr-0.5 text-sm font-normal text-muted-foreground">
            {prefix}
          </span>
        )}
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
