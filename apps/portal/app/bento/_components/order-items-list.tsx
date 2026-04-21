"use client"

import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { useDeleteOrderItem } from "@/hooks/bento/use-order-items"

import { ConfirmDialog } from "./confirm-dialog"

interface OrderItem {
  id: string
  menu_item_id: string
  no_sauce: boolean
  additional: number | null
  user_id: string | null
  anonymous_name?: string | null
  anonymous_contact?: string | null
  menu_items: {
    name: string
    price: number
  }
  user: {
    name: string | null
    email?: string
  } | null
}

interface GroupedOrderItem {
  user_id: string
  user_name: string | null
  items: OrderItem[]
  total: number
}

export function OrderItemsList({
  items,
  isActive,
  currentUserId,
  isAdmin,
  restaurantAdditional,
}: {
  items: OrderItem[]
  isActive: boolean
  currentUserId?: string
  isAdmin?: boolean
  restaurantAdditional?: string[] | null
}) {
  const deleteItem = useDeleteOrderItem()

  const handleDelete = async (id: string) => {
    try {
      await deleteItem.mutateAsync(id)
      toast.success("已刪除訂餐項目")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to delete")
      console.error("Error deleting item:", err)
      toast.error(`刪除失敗：${err.message}`)
    }
  }

  const groupedItems = items.reduce(
    (acc, item) => {
      const groupKey =
        item.user_id ?? `anon:${item.anonymous_name ?? "unknown"}`
      if (!acc[groupKey]) {
        acc[groupKey] = {
          user_id: groupKey,
          user_name: item.user?.name || item.anonymous_name || null,
          items: [],
          total: 0,
        }
      }
      acc[groupKey].items.push(item)
      acc[groupKey].total += item.menu_items?.price || 0
      return acc
    },
    {} as Record<string, GroupedOrderItem>
  )

  const groupedItemsArray = Object.values(groupedItems).sort((a, b) => {
    if (currentUserId) {
      if (a.user_id === currentUserId) return -1
      if (b.user_id === currentUserId) return 1
    }
    return b.total - a.total
  })

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        尚無訂餐項目
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groupedItemsArray.map((group) => (
        <div
          key={group.user_id}
          className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="text-sm font-medium">
              {group.user_name || "未知"}
              {group.items[0]?.anonymous_contact && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({group.items[0].anonymous_contact})
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>{item.menu_items?.name}</span>
                  {item.no_sauce && (
                    <Badge
                      variant="secondary"
                      className="px-2 py-0.5 text-[11px]"
                    >
                      不醬
                    </Badge>
                  )}
                  {item.additional !== null &&
                    item.additional !== undefined &&
                    restaurantAdditional &&
                    restaurantAdditional[item.additional] && (
                      <Badge
                        variant="secondary"
                        className="px-2 py-0.5 text-[11px]"
                      >
                        {restaurantAdditional[item.additional]}
                      </Badge>
                    )}
                  {isActive && (currentUserId === item.user_id || isAdmin) && (
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 py-0 text-xs text-muted-foreground hover:text-destructive"
                        >
                          刪除
                        </Button>
                      }
                      title="刪除此訂餐項目？"
                      description="此操作無法復原。"
                      confirmText="刪除"
                      variant="destructive"
                      onConfirm={() => handleDelete(item.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">總計</div>
            <div className="text-sm font-medium">
              NT$ {group.total.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
