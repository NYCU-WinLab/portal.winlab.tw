"use client"

import { ExternalLink, Image as ImageIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

import { formatOrderDate, orderBatchSuffix } from "@/lib/bento/date"

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
  order_date?: string | null
  restaurants: {
    id: string
    name: string
    phone: string
    google_map_link?: string | null
    additional?: string[] | null
    menu_image_url?: string | null
  }
  order_items?: OrderItem[]
}

export function OrderDetailHeader({ order }: { order: Order }) {
  const orderDate = formatOrderDate(order.order_date, order.id)
  const batch = orderBatchSuffix(order.id)
  const orderItems = order.order_items || []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-medium">{order.restaurants.name}</h1>
          <Badge variant="default" className="text-xs">
            {orderDate}
          </Badge>
          {batch && (
            <Badge variant="secondary" className="text-xs">
              第 {batch} 批
            </Badge>
          )}
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
          {order.restaurants.menu_image_url && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-muted-foreground"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  查看菜單圖
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{order.restaurants.name} 菜單</DialogTitle>
                </DialogHeader>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.restaurants.menu_image_url}
                  alt={`${order.restaurants.name} 菜單圖片`}
                  className="max-h-[80vh] w-full rounded-md object-contain"
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <OrderStats
        orderItems={orderItems}
        restaurantAdditional={order.restaurants?.additional || null}
      />
    </div>
  )
}
