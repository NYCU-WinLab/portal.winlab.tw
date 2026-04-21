"use client"

import { ExternalLink } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

import { parseOrderDate } from "@/lib/bento/date"

import { OrderStats } from "./order-stats"

interface OrderItem {
  menu_item_id: string
  no_sauce?: boolean
  additional?: number | null
  menu_items: {
    name: string
    price: number
  }
  user_id: string | null
}

interface Order {
  id: string
  restaurant_id: string
  status: "active" | "closed"
  created_at: string
  closed_at: string | null
  restaurants: {
    id: string
    name: string
    phone: string
    google_map_link?: string | null
    additional?: string[] | null
  }
  order_items?: OrderItem[]
}

export function OrderDetailHeader({ order }: { order: Order }) {
  const orderDate = parseOrderDate(order.id)
  const orderItems = order.order_items || []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-medium">{order.restaurants.name}</h1>
          <Badge variant="default" className="text-xs">
            {orderDate}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {order.restaurants.google_map_link && (
            <a
              href={order.restaurants.google_map_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-muted-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Google 地圖
            </a>
          )}
          <span>
            電話：
            <a
              href={`tel:${order.restaurants.phone}`}
              className="text-foreground transition-colors hover:text-muted-foreground"
            >
              {order.restaurants.phone}
            </a>
          </span>
        </div>
      </div>
      <OrderStats
        orderItems={orderItems}
        restaurantAdditional={order.restaurants?.additional || null}
      />
    </div>
  )
}
