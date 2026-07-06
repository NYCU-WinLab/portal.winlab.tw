"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useDeleteOrderItem } from "@/hooks/bento/use-order-items"
import {
  formatItemDateTime,
  groupByPerson,
  itemPersonName,
  sortByTime,
  type ViewOrderItem,
} from "@/lib/bento/order-items-view"

import { ConfirmDialog } from "./confirm-dialog"

type SortMode = "time" | "person"

interface OrderItemsListProps {
  items: ViewOrderItem[]
  isActive: boolean
  currentUserId?: string
  isAdmin?: boolean
  restaurantAdditional?: string[] | null
}

export function OrderItemsList({
  items,
  isActive,
  currentUserId,
  isAdmin,
  restaurantAdditional,
}: OrderItemsListProps) {
  const deleteItem = useDeleteOrderItem()
  const [sortMode, setSortMode] = useState<SortMode>("time")

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

  const canDelete = (item: ViewOrderItem) =>
    isActive && (currentUserId === item.user_id || Boolean(isAdmin))

  const deleteButton = (item: ViewOrderItem) =>
    canDelete(item) ? (
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
    ) : null

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        尚無訂餐項目
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SortToggle value={sortMode} onChange={setSortMode} />

      {sortMode === "time"
        ? sortByTime(items).map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm"
            >
              <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                {formatItemDateTime(item.created_at)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {itemPersonName(item)}
              </span>
              <span className="font-medium">{item.menu_items?.name}</span>
              <ItemOptionBadges
                item={item}
                restaurantAdditional={restaurantAdditional}
              />
              {deleteButton(item)}
            </div>
          ))
        : groupByPerson(items, currentUserId).map((group) => (
            <div
              key={group.key}
              className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-sm font-medium">
                  {group.userName || "未知"}
                  {group.contact && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({group.contact})
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums">
                        {formatItemDateTime(item.created_at)}
                      </span>
                      <span>{item.menu_items?.name}</span>
                      <ItemOptionBadges
                        item={item}
                        restaurantAdditional={restaurantAdditional}
                      />
                      {deleteButton(item)}
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

function SortToggle({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (mode: SortMode) => void
}) {
  const options: { mode: SortMode; label: string }[] = [
    { mode: "time", label: "依時間" },
    { mode: "person", label: "依人" },
  ]
  return (
    <div className="flex self-end rounded-lg border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChange(option.mode)}
          aria-pressed={value === option.mode}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === option.mode
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ItemOptionBadges({
  item,
  restaurantAdditional,
}: {
  item: ViewOrderItem
  restaurantAdditional?: string[] | null
}) {
  const additionalLabel =
    item.additional !== null &&
    item.additional !== undefined &&
    restaurantAdditional
      ? restaurantAdditional[item.additional]
      : undefined

  return (
    <>
      {item.selected_options?.map((opt, i) => (
        <Badge
          key={`${opt.group_name}-${i}`}
          variant="secondary"
          className="px-2 py-0.5 text-[11px]"
        >
          {opt.label}
          {opt.price_delta > 0 && ` +$${opt.price_delta}`}
        </Badge>
      ))}
      {item.no_sauce && (
        <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">
          不醬
        </Badge>
      )}
      {additionalLabel && (
        <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">
          {additionalLabel}
        </Badge>
      )}
    </>
  )
}
