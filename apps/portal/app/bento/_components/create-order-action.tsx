"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
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
import { useMenus } from "@/hooks/bento/use-menus"
import { useCreateOrder } from "@/hooks/bento/use-orders"
import { useAuth } from "@/hooks/use-auth"

type RestaurantRow = { id: string; name: string }

function todayIso() {
  return new Date().toISOString().split("T")[0]
}

export function CreateOrderAction() {
  const [open, setOpen] = useState(false)
  const [selectedRestaurant, setSelectedRestaurant] = useState("")
  const [orderDate, setOrderDate] = useState(todayIso)
  const { user } = useAuth()
  const { isAdmin } = useAdmin()
  const { data: restaurants } = useMenus()
  const createOrder = useCreateOrder()

  if (!isAdmin || !user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRestaurant || !orderDate) return

    try {
      await createOrder.mutateAsync({
        p_restaurant_id: selectedRestaurant,
        p_order_date: orderDate,
      })
      toast.success("訂單已建立")
      setOpen(false)
      setSelectedRestaurant("")
      setOrderDate(todayIso())
    } catch (error) {
      const err = error instanceof Error ? error : new Error("建立失敗")
      console.error("Error creating order:", err)
      toast.error(`建立失敗：${err.message}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">新增訂單</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增訂單</DialogTitle>
          <DialogDescription>選擇店家以建立新訂單</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="restaurant">店家</Label>
              <Select
                value={selectedRestaurant}
                onValueChange={setSelectedRestaurant}
              >
                <SelectTrigger id="restaurant" className="w-full">
                  <SelectValue placeholder="選擇店家" />
                </SelectTrigger>
                <SelectContent>
                  {((restaurants ?? []) as RestaurantRow[]).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderDate">訂單日期</Label>
              <Input
                id="orderDate"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
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
                createOrder.isPending || !selectedRestaurant || !orderDate
              }
            >
              {createOrder.isPending ? "建立中..." : "建立"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
