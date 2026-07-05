"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import type { OrderWithStats } from "@/lib/bento/types"
import { formatOrderDate, orderBatchSuffix } from "@/lib/bento/date"

import { OrderStats } from "./order-stats"

export function OrderCard({ order }: { order: OrderWithStats }) {
  const orderDate = formatOrderDate(order.order_date, order.id)
  const batch = orderBatchSuffix(order.id)
  const orderItems = order.order_items || []

  return (
    <Link
      href={`/bento/orders/${order.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{order.restaurants.name}</span>
        <Badge
          variant={order.status === "active" ? "default" : "outline"}
          className="text-xs"
        >
          {orderDate}
        </Badge>
        {batch && (
          <Badge variant="secondary" className="text-xs">
            第 {batch} 批
          </Badge>
        )}
      </div>
      <OrderStats
        orderItems={orderItems}
        restaurantAdditional={order.restaurants?.additional || null}
        variant="compact"
      />
    </Link>
  )
}
