"use client"

import { useState } from "react"
import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  useCopyOrderFromUser,
  useDeleteOrderItem,
} from "@/hooks/bento/use-order-items"
import {
  countItemsByUser,
  describeCopyPlan,
  formatItemDateTime,
  groupByPerson,
  isOverBudget,
  itemPersonName,
  sortByTime,
  type PersonGroup,
  type ViewOrderItem,
} from "@/lib/bento/order-items-view"

import { ConfirmDialog } from "./confirm-dialog"

type SortMode = "time" | "person"

interface OrderItemsListProps {
  items: ViewOrderItem[]
  orderId: string
  isActive: boolean
  currentUserId?: string
  isAdmin?: boolean
  restaurantAdditional?: string[] | null
}

export function OrderItemsList({
  items,
  orderId,
  isActive,
  currentUserId,
  isAdmin,
  restaurantAdditional,
}: OrderItemsListProps) {
  const deleteItem = useDeleteOrderItem()
  const copyOrder = useCopyOrderFromUser()
  const [sortMode, setSortMode] = useState<SortMode>("person")
  const myItemCount = countItemsByUser(items, currentUserId)

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

  const handleCopy = async (group: PersonGroup) => {
    if (!group.userId) return
    try {
      const copied = await copyOrder.mutateAsync({
        order_id: orderId,
        source_user_id: group.userId,
      })
      toast.success(
        `已改成和 ${group.userName || "對方"} 一樣的 ${copied} 筆訂餐`
      )
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to copy")
      console.error("Error copying order:", err)
      toast.error(`複製失敗：${err.message}`)
    }
  }

  // Anonymous (guest) entries are keyed by a free-text name rather than a user
  // id, so there is nothing stable to copy from — the RPC only takes a user id.
  const canCopy = (group: PersonGroup) =>
    isActive &&
    Boolean(currentUserId) &&
    Boolean(group.userId) &&
    group.userId !== currentUserId

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
        : groupByPerson(items, currentUserId).map((group) => {
            const overBudget = isOverBudget(group)
            return (
              <div
                key={group.key}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4",
                  overBudget &&
                    "border-red-200 bg-red-50 dark:border-red-400/25 dark:bg-red-400/10"
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {group.userName || "未知"}
                    {group.contact && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({group.contact})
                      </span>
                    )}
                    {canCopy(group) && (
                      <ConfirmDialog
                        trigger={
                          // Icon + label, not icon alone: IconCopy reads as "make
                          // another one", but this replaces. The icon carries
                          // "copy", the words carry what is being copied — 這份,
                          // the card this button sits on. No pronoun, so nothing
                          // here guesses at anyone's gender, and the name beside
                          // it already says whose order it is.
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 py-0 text-xs"
                          >
                            <IconCopy className="size-3" />
                            照這份點
                          </Button>
                        }
                        title={`訂餐改成和 ${group.userName || "對方"} 一樣？`}
                        description={describeCopyPlan(
                          group.userName || "對方",
                          group.items.length,
                          myItemCount
                        )}
                        confirmText="照這份點"
                        variant={myItemCount > 0 ? "destructive" : "default"}
                        onConfirm={() => handleCopy(group)}
                      />
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
                  <div
                    className={cn(
                      "text-sm font-medium",
                      overBudget && "text-red-800 dark:text-red-300"
                    )}
                  >
                    NT$ {group.total.toLocaleString()}
                  </div>
                </div>
              </div>
            )
          })}
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
    { mode: "person", label: "依人" },
    { mode: "time", label: "依時間" },
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
