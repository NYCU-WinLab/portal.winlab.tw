"use client"

import React, { useRef, useState } from "react"
import { IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useAdmin } from "@/hooks/bento/use-admin"
import { useMenu } from "@/hooks/bento/use-menus"
import { useOptionGroups } from "@/hooks/bento/use-option-groups"
import {
  useAddAnonymousItem,
  useAddOrderItem,
  useAddOrderItemWithOptions,
  useAdminAddItem,
} from "@/hooks/bento/use-order-items"
import { useOrder } from "@/hooks/bento/use-orders"
import { useUsers } from "@/hooks/bento/use-users"
import { useAuth } from "@/hooks/use-auth"

interface MenuItem {
  id: string
  name: string
  price: number
  type?: string | null
  order_count?: number
}

type OrderItemLike = { menu_item_id: string }

interface CartLine {
  key: string
  menu_item_id: string
  no_sauce: boolean
  additional: number | null
  optionValueIds: string[]
}

type ValueLabel = Map<string, { group: string; label: string; sort: number }>

function describeLine(
  line: Pick<
    CartLine,
    "menu_item_id" | "no_sauce" | "additional" | "optionValueIds"
  >,
  menuItems: MenuItem[],
  additionalOptions: string[] | null,
  valueLabel: ValueLabel
): string {
  const name = menuItems.find((m) => m.id === line.menu_item_id)?.name ?? ""
  const parts: string[] = []

  line.optionValueIds
    .map((id) => valueLabel.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .sort((a, b) => a.sort - b.sort)
    .forEach((v) => parts.push(v.label))

  if (line.no_sauce) parts.push("不醬")
  const additionalLabel =
    line.additional !== null ? additionalOptions?.[line.additional] : undefined
  if (additionalLabel) parts.push(additionalLabel)

  return parts.length > 0 ? `${name}（${parts.join("、")}）` : name
}

export function AddOrderItemDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState("")
  const [noSauce, setNoSauce] = useState(false)
  const [selectedAdditional, setSelectedAdditional] = useState<number | null>(
    null
  )
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({})
  const [cart, setCart] = useState<CartLine[]>([])
  const [targetUserId, setTargetUserId] = useState<string | null>(null)
  const [anonymousName, setAnonymousName] = useState("")
  const [anonymousContact, setAnonymousContact] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuth()
  const { isAdmin: isAdminUser } = useAdmin()
  const isAnonymous = !user

  const { data: order } = useOrder(open ? orderId : undefined)
  const restaurantId = order?.restaurants?.id
  const { data: menuData } = useMenu(open ? restaurantId : undefined)
  const { data: optionGroups } = useOptionGroups(
    open ? restaurantId : undefined
  )
  const { data: userList } = useUsers()

  const addItem = useAddOrderItem()
  const adminAddItem = useAdminAddItem()
  const addAnonymousItem = useAddAnonymousItem()
  const addWithOptions = useAddOrderItemWithOptions()

  const restaurantAdditionalOptions: string[] | null =
    order?.restaurants?.additional || null

  const groups = optionGroups ?? []
  const isDrinks = groups.length > 0
  const requiredGroups = groups.filter((g) => g.required)

  const valueLabel: ValueLabel = new Map()
  groups.forEach((g) =>
    g.values.forEach((v) =>
      valueLabel.set(v.id, {
        group: g.name,
        label: v.label,
        sort: g.sort_order,
      })
    )
  )

  const defaultAdditional =
    restaurantAdditionalOptions && restaurantAdditionalOptions.length > 0
      ? 0
      : null

  const menuItems: MenuItem[] = (() => {
    const allMenuItems = (menuData?.menu_items || []) as MenuItem[]
    const orderItems = (order?.order_items || []) as OrderItemLike[]
    const itemCountMap = new Map<string, number>()

    orderItems.forEach((item) => {
      itemCountMap.set(
        item.menu_item_id,
        (itemCountMap.get(item.menu_item_id) || 0) + 1
      )
    })

    const menuItemsWithCount = allMenuItems.map((item) => ({
      ...item,
      order_count: itemCountMap.get(item.id) || 0,
    }))

    menuItemsWithCount.sort((a, b) => {
      const countA = a.order_count || 0
      const countB = b.order_count || 0
      if (countA !== countB) return countB - countA
      if (a.type && b.type && a.type !== b.type)
        return a.type.localeCompare(b.type)
      if (a.type && !b.type) return -1
      if (!a.type && b.type) return 1
      return b.price - a.price
    })

    return menuItemsWithCount
  })()

  const resetSelection = () => {
    setSelectedItem("")
    setNoSauce(false)
    setSelectedAdditional(defaultAdditional)
    setSelectedOptions({})
  }

  const resetAll = () => {
    setCart([])
    setTargetUserId(null)
    setAnonymousName("")
    setAnonymousContact("")
    setShowConfirm(false)
    resetSelection()
  }

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (value) {
      setSelectedAdditional(defaultAdditional)
      setSelectedOptions({})
    } else {
      resetAll()
    }
  }

  const pendingOptionsMet = requiredGroups.every((g) => selectedOptions[g.id])

  // Monotonic counter so cart keys stay unique across add/remove sequences
  // even when crypto.randomUUID is unavailable (e.g. plain-http contexts).
  const keySeq = useRef(0)
  const makeKey = () => {
    keySeq.current += 1
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `line-${keySeq.current}`
  }

  const handleAddToCart = () => {
    if (!selectedItem) return
    if (isDrinks && !pendingOptionsMet) return
    setCart((prev) => [
      ...prev,
      {
        key: makeKey(),
        menu_item_id: selectedItem,
        no_sauce: isDrinks ? false : noSauce,
        additional: isDrinks ? null : selectedAdditional,
        optionValueIds: isDrinks ? Object.values(selectedOptions) : [],
      },
    ])
    resetSelection()
  }

  const handleRemoveFromCart = (key: string) => {
    setCart((prev) => prev.filter((line) => line.key !== key))
  }

  // For meal shops a still-pending selection is auto-included on submit, so the
  // single-item flow stays one tap. Drink shops require 加入清單 first (each drink
  // has mandatory ice/sugar), so only the cart is submitted.
  const pendingLine: CartLine | null =
    !isDrinks && selectedItem
      ? {
          key: "pending",
          menu_item_id: selectedItem,
          no_sauce: noSauce,
          additional: selectedAdditional,
          optionValueIds: [],
        }
      : null
  const effectiveLines: CartLine[] = pendingLine ? [...cart, pendingLine] : cart

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (effectiveLines.length === 0) return
    if (isAnonymous && (!anonymousName.trim() || !anonymousContact.trim()))
      return
    if (!isAnonymous && !user) return

    if (isAnonymous && !showConfirm) {
      setShowConfirm(true)
      return
    }

    await doSubmit()
  }

  const doSubmit = async () => {
    setSubmitting(true)
    let added = 0
    try {
      for (const line of effectiveLines) {
        if (isDrinks) {
          await addWithOptions.mutateAsync({
            order_id: orderId,
            menu_item_id: line.menu_item_id,
            option_value_ids: line.optionValueIds,
            user_id: isAdminUser && targetUserId ? targetUserId : null,
            anonymous_name: isAnonymous ? anonymousName.trim() : null,
            anonymous_contact: isAnonymous ? anonymousContact.trim() : null,
          })
        } else if (isAnonymous) {
          await addAnonymousItem.mutateAsync({
            order_id: orderId,
            menu_item_id: line.menu_item_id,
            anonymous_name: anonymousName.trim(),
            anonymous_contact: anonymousContact.trim(),
            no_sauce: line.no_sauce,
            additional: line.additional,
          })
        } else if (isAdminUser && targetUserId) {
          await adminAddItem.mutateAsync({
            order_id: orderId,
            menu_item_id: line.menu_item_id,
            user_id: targetUserId,
            no_sauce: line.no_sauce,
            additional: line.additional,
          })
        } else {
          await addItem.mutateAsync({
            order_id: orderId,
            menu_item_id: line.menu_item_id,
            no_sauce: line.no_sauce,
            additional: line.additional,
          })
        }
        added += 1
      }

      toast.success(`已新增 ${added} 筆訂餐`)
      setOpen(false)
      resetAll()
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error("Failed to add item")
      console.error("Error adding order item:", err)
      // Keep only the lines that have NOT been inserted yet, so a retry can't
      // duplicate the ones that already succeeded (inserts aren't idempotent).
      const remaining = effectiveLines
        .slice(added)
        .map((line) => ({ ...line, key: makeKey() }))
      setCart(remaining)
      resetSelection()
      setShowConfirm(false)
      const suffix =
        added > 0 ? `（已成功新增 ${added} 筆，其餘保留於清單）` : ""
      toast.error(`新增訂餐失敗：${err.message}${suffix}`)
    } finally {
      setSubmitting(false)
    }
  }

  const isPending =
    submitting ||
    addItem.isPending ||
    adminAddItem.isPending ||
    addAnonymousItem.isPending ||
    addWithOptions.isPending

  const submitDisabled =
    isPending ||
    effectiveLines.length === 0 ||
    (isAnonymous && (!anonymousName.trim() || !anonymousContact.trim()))

  const addDisabled = !selectedItem || (isDrinks && !pendingOptionsMet)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">新增訂餐</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新增訂餐</DialogTitle>
          <DialogDescription>
            {isDrinks
              ? "選擇品項與甜度、冰量，加入清單後一次送出"
              : "選擇品項與選項，可加入多筆後一次送出"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            {isAnonymous && (
              <div className="space-y-3">
                <Input
                  placeholder="請輸入您的姓名"
                  value={anonymousName}
                  onChange={(e) => setAnonymousName(e.target.value)}
                  required
                />
                <Input
                  placeholder="聯絡方式（電話或 LINE ID）"
                  value={anonymousContact}
                  onChange={(e) => setAnonymousContact(e.target.value)}
                  required
                />
              </div>
            )}
            {isAdminUser && (
              <Select
                value={targetUserId ?? ""}
                onValueChange={(v) => setTargetUserId(v || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="代替哪位用戶點餐（留空為自己）" />
                </SelectTrigger>
                <SelectContent>
                  {(userList ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Item picker — stacks vertically so it stays usable on mobile */}
            <div className="space-y-3 rounded-lg border p-3">
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger id="menuItem" className="w-full">
                  <SelectValue placeholder="選擇品項" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const grouped = new Map<string, MenuItem[]>()
                    menuItems.forEach((item) => {
                      const type = item.type || "其他"
                      if (!grouped.has(type)) grouped.set(type, [])
                      grouped.get(type)!.push(item)
                    })

                    const result: React.ReactElement[] = []
                    grouped.forEach((items, type) => {
                      if (grouped.size > 1) {
                        result.push(
                          <div
                            key={`header-${type}`}
                            className="sticky top-0 bg-muted px-3 py-2 text-xs font-medium text-foreground"
                          >
                            {type}
                          </div>
                        )
                      }
                      items.forEach((item) => {
                        const orderCountText =
                          item.order_count && item.order_count > 0
                            ? `（${item.order_count} 個）`
                            : ""
                        result.push(
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} - NT$ {item.price.toLocaleString()}{" "}
                            {orderCountText}
                          </SelectItem>
                        )
                      })
                    })
                    return result
                  })()}
                </SelectContent>
              </Select>

              {/* Drink shops: mandatory option groups (甜度 / 冰量). */}
              {isDrinks &&
                groups.map((group) => (
                  <div key={group.id} className="flex items-center gap-3">
                    <Label className="w-12 shrink-0 text-sm">
                      {group.name}
                      {group.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Select
                      value={selectedOptions[group.id] ?? ""}
                      onValueChange={(v) =>
                        setSelectedOptions((prev) => ({
                          ...prev,
                          [group.id]: v,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={`選擇${group.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {group.values.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

              {/* Meal shops: 不醬 + restaurant additional option. */}
              {!isDrinks && (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="noSauce"
                      checked={noSauce}
                      onCheckedChange={(checked) =>
                        setNoSauce(checked === true)
                      }
                    />
                    <Label
                      htmlFor="noSauce"
                      className="cursor-pointer whitespace-nowrap"
                    >
                      不醬
                    </Label>
                  </div>
                  {restaurantAdditionalOptions &&
                    restaurantAdditionalOptions.length > 0 && (
                      <Select
                        value={
                          selectedAdditional !== null
                            ? selectedAdditional.toString()
                            : undefined
                        }
                        onValueChange={(value) =>
                          setSelectedAdditional(parseInt(value))
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="選項" />
                        </SelectTrigger>
                        <SelectContent>
                          {restaurantAdditionalOptions.map(
                            (option: string, index: number) => (
                              <SelectItem key={index} value={index.toString()}>
                                {option}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    )}
                </div>
              )}

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleAddToCart}
                disabled={addDisabled}
              >
                加入清單
              </Button>
            </div>

            {/* Selected list */}
            {cart.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  已加入 {cart.length} 筆
                </p>
                {cart.map((line) => (
                  <div
                    key={line.key}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {describeLine(
                        line,
                        menuItems,
                        restaurantAdditionalOptions,
                        valueLabel
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => handleRemoveFromCart(line.key)}
                      aria-label="移除"
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {isAnonymous && showConfirm && (
              <div className="space-y-2 rounded-lg border bg-muted p-4">
                <p className="text-sm font-medium">請確認您的訂餐資訊：</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    姓名：
                    <span className="font-medium text-foreground">
                      {anonymousName}
                    </span>
                  </p>
                  <p>
                    聯絡方式：
                    <span className="font-medium text-foreground">
                      {anonymousContact}
                    </span>
                  </p>
                  <div>
                    品項：
                    <ul className="mt-1 list-inside list-disc font-medium text-foreground">
                      {effectiveLines.map((line, i) => (
                        <li key={line.key === "pending" ? `p-${i}` : line.key}>
                          {describeLine(
                            line,
                            menuItems,
                            restaurantAdditionalOptions,
                            valueLabel
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {isAnonymous && showConfirm ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                >
                  返回修改
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? "送出中..."
                    : `確認送出 ${effectiveLines.length} 筆`}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={submitDisabled}>
                  {isPending
                    ? "送出中..."
                    : effectiveLines.length > 1
                      ? `送出 ${effectiveLines.length} 筆`
                      : "送出"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
