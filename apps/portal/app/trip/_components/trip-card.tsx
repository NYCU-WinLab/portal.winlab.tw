"use client"

import { Lock, LockOpen, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { useDeleteTrip, useSetTripStatus } from "@/hooks/trip/use-trips"
import type { Trip } from "@/lib/trip/types"

import { ConfirmDialog } from "./confirm-dialog"

export function TripCard({ trip, isAdmin }: { trip: Trip; isAdmin: boolean }) {
  const setStatus = useSetTripStatus()
  const deleteTrip = useDeleteTrip()
  const isOpen = trip.status === "open"

  const handleToggle = async () => {
    try {
      await setStatus.mutateAsync({
        id: trip.id,
        status: isOpen ? "closed" : "open",
      })
      toast.success(isOpen ? "已關閉" : "已重新開啟")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切換失敗")
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTrip.mutateAsync(trip.id)
      toast.success("已刪除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刪除失敗")
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Link
        href={`/trip/${trip.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <span className="truncate text-sm font-medium">{trip.name}</span>
        {trip.description && (
          <p className="truncate text-sm text-muted-foreground">
            {trip.description}
          </p>
        )}
      </Link>
      <Badge variant="outline" className="shrink-0 text-xs">
        {isOpen ? "進行中" : "已關閉"}
      </Badge>
      {isAdmin && (
        <>
          <ConfirmDialog
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground"
                aria-label={isOpen ? "關閉 trip" : "重新開啟 trip"}
              >
                {isOpen ? (
                  <Lock className="size-4" />
                ) : (
                  <LockOpen className="size-4" />
                )}
              </Button>
            }
            title={isOpen ? "關閉這個 trip？" : "重新開啟這個 trip？"}
            description={
              isOpen
                ? "關閉後成員無法再上傳/修改/刪除自己的檔案。"
                : "重新開啟後成員可以繼續上傳。"
            }
            confirmText={isOpen ? "關閉" : "開啟"}
            onConfirm={handleToggle}
          />
          <ConfirmDialog
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground"
                aria-label="刪除 trip"
              >
                <Trash2 className="size-4" />
              </Button>
            }
            title="刪除這個 trip？"
            description={`${trip.name} — 連同所有成員上傳的檔案一起被刪掉，無法復原。`}
            confirmText="刪除"
            variant="destructive"
            onConfirm={handleDelete}
          />
        </>
      )}
    </div>
  )
}
