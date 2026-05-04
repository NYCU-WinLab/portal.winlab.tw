"use client"

import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { useDeleteLeave } from "@/hooks/leave/use-leaves"
import { useAuth } from "@/hooks/use-auth"
import { formatLeaveDate } from "@/lib/leave/date"
import type { LeaveWithUser } from "@/lib/leave/types"

import { ConfirmDialog } from "./confirm-dialog"

export function LeaveCard({ leave }: { leave: LeaveWithUser }) {
  const { user } = useAuth()
  const deleteLeave = useDeleteLeave()
  const isMine = user?.id === leave.user_id
  const displayName = leave.user?.name ?? "未知成員"

  const handleDelete = async () => {
    try {
      await deleteLeave.mutateAsync(leave.id)
      toast.success("已撤回請假")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("撤回失敗")
      toast.error(err.message)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{displayName}</span>
        <p className="truncate text-sm text-muted-foreground">{leave.reason}</p>
      </div>
      <Badge variant="outline" className="shrink-0 text-xs">
        {formatLeaveDate(leave.date)}
      </Badge>
      {isMine && (
        <ConfirmDialog
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label="撤回請假"
            >
              <Trash2 className="size-4" />
            </Button>
          }
          title="撤回這筆請假？"
          description={`${formatLeaveDate(leave.date)} — ${leave.reason}`}
          confirmText="撤回"
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
