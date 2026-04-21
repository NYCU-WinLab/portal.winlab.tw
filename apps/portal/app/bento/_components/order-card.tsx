"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import type { OrderWithStats } from "@/lib/bento/types"
import { parseOrderDate } from "@/lib/bento/date"

import { OrderStats } from "./order-stats"

export function OrderCard({ order }: { order: OrderWithStats }) {
  const orderDate = parseOrderDate(order.id)
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
      </div>
      <OrderStats
        orderItems={orderItems}
        restaurantAdditional={order.restaurants?.additional || null}
      />
    </Link>
  )
}
