"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useOrders } from "@/hooks/bento/use-orders"

import { CreateOrderAction } from "./create-order-action"
import { OrderCard } from "./order-card"

export function OrderList() {
  const { data: orders, isLoading } = useOrders()

  const activeOrders = (orders ?? []).filter((o) => o.status === "active")
  const closedOrders = (orders ?? []).filter((o) => o.status === "closed")

  if (isLoading && !orders) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-24 rounded-md" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[96px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Orders</h1>
          <p className="text-sm text-muted-foreground">
            目前進行中與歷史訂單。
          </p>
        </div>
        <CreateOrderAction />
      </div>

      {activeOrders.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">進行中</h2>
          <div className="flex flex-col gap-3">
            {activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}

      {closedOrders.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">已結束</h2>
          <div className="flex flex-col gap-3">
            {closedOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}

      {(orders ?? []).length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          尚無訂單
        </div>
      )}
    </div>
  )
}
