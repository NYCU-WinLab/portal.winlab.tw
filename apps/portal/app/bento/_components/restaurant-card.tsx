"use client"

import {
  Ban,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

import {
  useDeleteMenu,
  useToggleMenuActive,
  useTogglePinned,
} from "@/hooks/bento/use-menus"
import { groupMenuItems } from "@/lib/bento/menu"

import { ConfirmDialog } from "./confirm-dialog"
import { EditRestaurantDialog } from "./edit-restaurant-dialog"

interface Restaurant {
  id: string
  name: string
  phone: string
  google_map_link?: string | null
  created_at: string
  additional?: string[] | null
  is_active?: boolean
  is_pinned?: boolean
}

type MenuItemRow = {
  id: string
  name: string
  price: number
  type?: string | null
}

// Cheapest first reads as a ramp down the price column, which is what people
// scan a menu for. Name breaks the ties so the order never wobbles.
function byPriceThenName(a: MenuItemRow, b: MenuItemRow) {
  if (a.price !== b.price) return a.price - b.price
  return a.name.localeCompare(b.name)
}

function MenuItemRowView({ item }: { item: MenuItemRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 break-words">{item.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        NT$ {item.price.toLocaleString()}
      </span>
    </div>
  )
}

function MenuItems({ items }: { items: MenuItemRow[] }) {
  const groups = groupMenuItems(items)

  // A store with no categories collapses into a single "其他" bucket. Spreading
  // its items across the columns beats one tall group next to dead space —
  // 和味's 48 dishes are exactly this case.
  if (groups.length <= 1) {
    return (
      <div className="grid gap-x-6 rounded-lg border border-border px-1 py-1 md:grid-cols-2">
        {items
          .slice()
          .sort(byPriceThenName)
          .map((item) => (
            <MenuItemRowView key={item.id} item={item} />
          ))}
      </div>
    )
  }

  return (
    <div className="grid items-start gap-3 md:grid-cols-2">
      {groups.map((group) => (
        <div
          key={group.type}
          className="overflow-hidden rounded-lg border border-border"
        >
          <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium">
            {group.type}
          </div>
          <div className="divide-y divide-border">
            {group.items
              .slice()
              .sort(byPriceThenName)
              .map((item) => (
                <MenuItemRowView key={item.id} item={item} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RestaurantCard({
  restaurant,
  menuItems,
  isAdmin,
  forceOpen = false,
}: {
  restaurant: Restaurant
  menuItems: MenuItemRow[]
  isAdmin: boolean
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const deleteMenu = useDeleteMenu(restaurant.id)
  const toggleActive = useToggleMenuActive()
  const togglePinned = useTogglePinned()

  const isActive = restaurant.is_active !== false
  const isPinned = restaurant.is_pinned === true

  const handleDelete = async () => {
    try {
      await deleteMenu.mutateAsync()
      toast.success("店家已刪除")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("刪除失敗")
      toast.error(err.message)
    }
  }

  const handleToggleActive = async () => {
    const nextActive = !isActive
    try {
      await toggleActive.mutateAsync({ id: restaurant.id, nextActive })
      toast.success(nextActive ? "店家已啟用" : "店家已停用")
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(nextActive ? "啟用失敗" : "停用失敗")
      toast.error(err.message)
    }
  }

  const handleTogglePinned = async () => {
    const nextPinned = !isPinned
    try {
      await togglePinned.mutateAsync({ id: restaurant.id, nextPinned })
      toast.success(nextPinned ? "已置頂" : "已取消置頂")
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error(nextPinned ? "置頂失敗" : "取消置頂失敗")
      toast.error(err.message)
    }
  }

  return (
    <Collapsible
      open={forceOpen || open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-xl border border-border bg-card transition-opacity",
        !isActive && "opacity-60",
        isPinned && "border-foreground/20"
      )}
    >
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          {isPinned && <Pin className="size-3.5 shrink-0 fill-current" />}
          <span className="min-w-0 flex-1 text-sm font-medium break-words">
            {restaurant.name}
          </span>
          {!isActive && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              已停用
            </Badge>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {menuItems.length} 品項
          </span>
        </CollapsibleTrigger>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-6">
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
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-1">
              <EditRestaurantDialog
                restaurant={restaurant}
                menuItems={menuItems}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={togglePinned.isPending}
                onClick={handleTogglePinned}
              >
                {isPinned ? (
                  <PinOff className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Pin className="mr-1 h-3.5 w-3.5" />
                )}
                {togglePinned.isPending
                  ? "處理中..."
                  : isPinned
                    ? "取消置頂"
                    : "置頂"}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggleActive.isPending}
                  >
                    {isActive ? (
                      <Ban className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    {toggleActive.isPending
                      ? "處理中..."
                      : isActive
                        ? "停用"
                        : "啟用"}
                  </Button>
                }
                title={
                  isActive
                    ? `停用「${restaurant.name}」？`
                    : `啟用「${restaurant.name}」？`
                }
                description={
                  isActive
                    ? "停用後，這間店家將不會出現在新增訂單與店家列表中。已存在的訂單不受影響。"
                    : "啟用後，這間店家會重新出現在訂單與店家列表中。"
                }
                confirmText={isActive ? "停用" : "啟用"}
                onConfirm={handleToggleActive}
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
      </div>

      <CollapsibleContent>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {menuItems.length > 0 ? (
            <MenuItems items={menuItems} />
          ) : (
            <div className="py-3 text-center text-xs text-muted-foreground">
              尚無品項
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
