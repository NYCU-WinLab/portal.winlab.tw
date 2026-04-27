"use client"

import { useState, type ReactNode } from "react"
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
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { useUpdateTripFileDescription } from "@/hooks/trip/use-trip-files"

export function EditDescriptionDialog({
  tripId,
  fileId,
  current,
  trigger,
}: {
  tripId: string
  fileId: string
  current: string | null
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current ?? "")
  const update = useUpdateTripFileDescription(tripId)

  const handleOpenChange = (next: boolean) => {
    if (next) setValue(current ?? "")
    setOpen(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = value.trim()
    try {
      await update.mutateAsync({
        id: fileId,
        description: next.length > 0 ? next : null,
      })
      toast.success("已儲存")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯描述</DialogTitle>
          <DialogDescription>
            描述會顯示在檔名下方。空白即清除。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file-desc">描述</Label>
              <Textarea
                id="file-desc"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="例：3/14 飯店住宿"
                rows={3}
                autoFocus
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
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
