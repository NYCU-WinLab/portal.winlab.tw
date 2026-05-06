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
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { useUpdateTrip } from "@/hooks/trip/use-trips"

export function EditTripDialog({
  id,
  name,
  description,
  onClose,
}: {
  id: string
  name: string
  description: string | null
  onClose: () => void
}) {
  const [draftName, setDraftName] = useState(name)
  const [draftDesc, setDraftDesc] = useState(description ?? "")
  const update = useUpdateTrip()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = draftName.trim()
    if (!next) return
    try {
      await update.mutateAsync({
        id,
        name: next,
        description: draftDesc.trim() || null,
      })
      toast.success("已儲存")
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗")
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯 Trip</DialogTitle>
            <DialogDescription>改名稱或說明，檔案不會動到。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="trip-name-edit">
                名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trip-name-edit"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                disabled={update.isPending}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trip-desc-edit">說明</Label>
              <Textarea
                id="trip-desc-edit"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="日期、補助上限、特別說明…"
                rows={3}
                disabled={update.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={update.isPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || !draftName.trim()}
            >
              {update.isPending ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
