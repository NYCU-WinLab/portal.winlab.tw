"use client"

import { Lock, LockOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { useDeleteTrip, useSetTripStatus } from "@/hooks/trip/use-trips"
import type { Trip } from "@/lib/trip/types"

import { EditTripDialog } from "./edit-trip-dialog"

export function TripRowActions({ trip }: { trip: Trip }) {
  const [editOpen, setEditOpen] = useState(false)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
      setToggleOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切換失敗")
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTrip.mutateAsync(trip.id)
      toast.success("已刪除")
      setDeleteOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刪除失敗")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`動作 — ${trip.name}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            編輯
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setToggleOpen(true)}>
            {isOpen ? (
              <>
                <Lock className="size-4" />
                關閉
              </>
            ) : (
              <>
                <LockOpen className="size-4" />
                重新開啟
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" />
            刪除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <EditTripDialog
          id={trip.id}
          name={trip.name}
          description={trip.description}
          onClose={() => setEditOpen(false)}
        />
      )}

      <AlertDialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOpen ? "關閉這個 trip？" : "重新開啟這個 trip？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOpen
                ? "關閉後成員無法再上傳/修改/刪除自己的檔案。"
                : "重新開啟後成員可以繼續上傳。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleToggle()
              }}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending ? "處理中..." : isOpen ? "關閉" : "開啟"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這個 trip？</AlertDialogTitle>
            <AlertDialogDescription>
              {trip.name} — 連同所有成員上傳的檔案一起被刪掉，無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTrip.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleteTrip.isPending}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
            >
              {deleteTrip.isPending ? "處理中..." : "刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
