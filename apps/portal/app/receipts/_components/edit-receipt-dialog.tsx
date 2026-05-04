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

import { useUpdateReceiptName } from "@/hooks/receipts/use-receipts"

export function EditReceiptDialog({
  id,
  name,
  onClose,
}: {
  id: string
  name: string
  onClose: () => void
}) {
  const [draft, setDraft] = useState(name)
  const update = useUpdateReceiptName()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    update.mutate(
      { id, name: draft },
      {
        onSuccess: () => {
          toast.success("已更名")
          onClose()
        },
        onError: (err) => toast.error(`更名失敗：${err.message}`),
      }
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯名稱</DialogTitle>
            <DialogDescription>
              改的是顯示用的名稱；檔案不會動到。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="receipt-name-edit">
              名稱 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="receipt-name-edit"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={update.isPending}
              required
              autoFocus
            />
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
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
