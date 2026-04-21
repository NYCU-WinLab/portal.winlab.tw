"use client"

import { ExternalLink, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  useDeleteMenu,
  useMenu,
  useMenuItemCounts,
} from "@/hooks/bento/use-menus"

import { ConfirmDialog } from "./confirm-dialog"
import { EditRestaurantDialog } from "./edit-restaurant-dialog"

interface Restaurant {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  created_at: string
  additional?: string[] | null
}

type MenuItemRow = {
  id: string
  name: string
  price: number
  type?: string | null
}

type StatsItem = {
  id: string
  order_count: number
}

export function RestaurantCard({
  restaurant,
  isAdmin,
}: {
  restaurant: Restaurant
  isAdmin: boolean
}) {
  const { data: restaurantData, isLoading: menuLoading } = useMenu(
    restaurant.id
  )
  const { data: stats, isLoading: statsLoading } = useMenuItemCounts(
    restaurant.id
  )
  const deleteMenu = useDeleteMenu(restaurant.id)

  const menuItems = (restaurantData?.menu_items || []) as MenuItemRow[]
  const loading = menuLoading || statsLoading

  const handleDelete = async () => {
    try {
      await deleteMenu.mutateAsync()
      toast.success("店家已刪除")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("刪除失敗")
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{restaurant.name}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {restaurant.google_map_link && (
              <a
                href={restaurant.google_map_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-muted-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Google 地圖
              </a>
            )}
            <span>
              電話：
              <a
                href={`tel:${restaurant.phone}`}
                className="text-foreground transition-colors hover:text-muted-foreground"
              >
                {restaurant.phone}
              </a>
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <EditRestaurantDialog
              restaurant={restaurant}
              menuItems={menuItems}
            />
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleteMenu.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {deleteMenu.isPending ? "刪除中..." : "刪除"}
                </Button>
              }
              title={`刪除「${restaurant.name}」？`}
              description="此操作將刪除所有品項與訂單記錄，且無法復原。"
              confirmText="刪除"
              variant="destructive"
              onConfirm={handleDelete}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : menuItems.length > 0 ? (
        <div className="flex flex-col divide-y rounded-lg border border-border text-sm">
          {menuItems
            .slice()
            .sort((a, b) => {
              const aCount =
                (stats?.items as StatsItem[])?.find((s) => s.id === a.id)
                  ?.order_count ?? 0
              const bCount =
                (stats?.items as StatsItem[])?.find((s) => s.id === b.id)
                  ?.order_count ?? 0
              if (aCount !== bCount) return bCount - aCount
              return b.price - a.price
            })
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span>{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  NT$ {item.price.toLocaleString()}
                </span>
              </div>
            ))}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-muted-foreground">
          尚無品項
        </div>
      )}
    </div>
  )
}
