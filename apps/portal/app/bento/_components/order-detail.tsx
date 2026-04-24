"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useAdmin } from "@/hooks/bento/use-admin"
import {
  useCloseOrder,
  useDeleteOrder,
  useOrder,
} from "@/hooks/bento/use-orders"
import { useAuth } from "@/hooks/use-auth"

import { AddOrderItemDialog } from "./add-order-item-dialog"
import { ConfirmDialog } from "./confirm-dialog"
import { OrderDetailHeader } from "./order-detail-header"
import { OrderItemsList } from "./order-items-list"

export function OrderDetail({ orderId }: { orderId: string }) {
  const { isAdmin } = useAdmin()
  const { user } = useAuth()
  const { data: order } = useOrder(orderId)
  const router = useRouter()
  const closeOrder = useCloseOrder()
  const deleteOrder = useDeleteOrder()

  if (!order) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const isActive = order.status === "active"

  const handleClose = async () => {
    try {
      await closeOrder.mutateAsync(orderId)
      toast.success("訂單已關閉")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("關閉失敗")
      toast.error(err.message)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteOrder.mutateAsync(orderId)
      toast.success("訂單已刪除")
      router.push("/bento")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("刪除失敗")
      toast.error(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <OrderDetailHeader order={order} />

      {isActive && (
        <div className="flex flex-wrap gap-2">
          <AddOrderItemDialog orderId={orderId} />
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={closeOrder.isPending}
              >
                {closeOrder.isPending ? "關閉中..." : "關閉訂單"}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    刪除訂單
                  </Button>
                }
                title="確定要刪除訂單嗎？"
                description="此操作將永久刪除訂單，且無法復原。"
                confirmText="刪除"
                variant="destructive"
                onConfirm={handleDelete}
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">訂單項目</h2>
        <OrderItemsList
          items={order.order_items}
          isActive={isActive}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          restaurantAdditional={order.restaurants?.additional || null}
        />
      </div>
    </div>
  )
}
