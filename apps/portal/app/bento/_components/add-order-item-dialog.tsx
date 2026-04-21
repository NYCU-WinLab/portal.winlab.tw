"use client"

import React, { useState } from "react"
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
import {
  useAddAnonymousItem,
  useAddOrderItem,
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

export function AddOrderItemDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState("")
  const [noSauce, setNoSauce] = useState(false)
  const [selectedAdditional, setSelectedAdditional] = useState<number | null>(
    null
  )
  const [targetUserId, setTargetUserId] = useState<string | null>(null)
  const [anonymousName, setAnonymousName] = useState("")
  const [anonymousContact, setAnonymousContact] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const { user } = useAuth()
  const { isAdmin: isAdminUser } = useAdmin()
  const isAnonymous = !user

  const { data: order } = useOrder(open ? orderId : undefined)
  const restaurantId = order?.restaurants?.id
  const { data: menuData } = useMenu(open ? restaurantId : undefined)
  const { data: userList } = useUsers()

  const addItem = useAddOrderItem()
  const adminAddItem = useAdminAddItem()
  const addAnonymousItem = useAddAnonymousItem()

  const restaurantAdditionalOptions = order?.restaurants?.additional || null

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

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (value) {
      if (
        restaurantAdditionalOptions &&
        restaurantAdditionalOptions.length > 0
      ) {
        setSelectedAdditional(0)
      } else {
        setSelectedAdditional(null)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem) return
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
    try {
      if (isAnonymous) {
        await addAnonymousItem.mutateAsync({
          order_id: orderId,
          menu_item_id: selectedItem,
          anonymous_name: anonymousName.trim(),
          anonymous_contact: anonymousContact.trim(),
          no_sauce: noSauce,
          additional: selectedAdditional,
        })
      } else if (isAdminUser && targetUserId) {
        await adminAddItem.mutateAsync({
          order_id: orderId,
          menu_item_id: selectedItem,
          user_id: targetUserId,
          no_sauce: noSauce,
          additional: selectedAdditional,
        })
      } else {
        await addItem.mutateAsync({
          order_id: orderId,
          menu_item_id: selectedItem,
          no_sauce: noSauce,
          additional: selectedAdditional,
        })
      }

      toast.success("已新增訂餐")
      setOpen(false)
      setSelectedItem("")
      setNoSauce(false)
      setSelectedAdditional(null)
      setTargetUserId(null)
      setShowConfirm(false)
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error("Failed to add item")
      console.error("Error adding order item:", err)
      toast.error(`新增訂餐失敗：${err.message}`)
      setShowConfirm(false)
    }
  }

  const isPending =
    addItem.isPending || adminAddItem.isPending || addAnonymousItem.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">新增訂餐</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增訂餐</DialogTitle>
          <DialogDescription>選擇品項並確認選項</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {isAnonymous && (
            <div className="space-y-3 pb-4">
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
            <div className="pb-4">
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
            </div>
          )}
          <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1">
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
                            className="sticky top-0 bg-muted/50 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-sm"
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
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="noSauce"
                checked={noSauce}
                onCheckedChange={(checked) => setNoSauce(checked === true)}
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
          {isAnonymous && showConfirm && (
            <div className="mb-4 space-y-2 rounded-lg border bg-muted p-4">
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
                <p>
                  品項：
                  <span className="font-medium text-foreground">
                    {menuItems.find((item) => item.id === selectedItem)?.name ??
                      ""}
                    {noSauce ? "（不醬）" : ""}
                    {selectedAdditional !== null &&
                    restaurantAdditionalOptions?.[selectedAdditional]
                      ? `（${restaurantAdditionalOptions[selectedAdditional]}）`
                      : ""}
                  </span>
                </p>
              </div>
            </div>
          )}
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
                  {isPending ? "新增中..." : "確認送出"}
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
                <Button
                  type="submit"
                  disabled={
                    isPending ||
                    !selectedItem ||
                    (isAnonymous &&
                      (!anonymousName.trim() || !anonymousContact.trim()))
                  }
                >
                  {isPending ? "新增中..." : "新增"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
