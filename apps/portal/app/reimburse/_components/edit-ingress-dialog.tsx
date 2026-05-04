"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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

import type { Ingress } from "@/lib/reimburse/types"

import { updateIngressAction } from "../actions"

interface EditIngressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Ingress
}

function toFormData(data: Ingress) {
  return {
    ingress_date: data.ingressDate,
    ingress_amount: data.ingressAmount.toString(),
    ingress_comment: data.ingressComment ?? "",
  }
}

export function EditIngressDialog({
  open,
  onOpenChange,
  data,
}: EditIngressDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(() => toFormData(data))

  useEffect(() => {
    setFormData(toFormData(data))
  }, [data])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await updateIngressAction(data.id, {
        ingress_date: formData.ingress_date,
        ingress_amount: parseFloat(formData.ingress_amount),
        ingress_comment: formData.ingress_comment || null,
        ingress_files: [],
      })

      if (result.success) {
        onOpenChange(false)
        router.refresh()
        toast.success("已更新")
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯收入記錄</DialogTitle>
            <DialogDescription>請修改以下資訊</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-ingress_date">
                  日期 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-ingress_date"
                  type="date"
                  value={formData.ingress_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ingress_date: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ingress_amount">
                  金額 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-ingress_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ingress_amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ingress_amount: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-ingress_comment">備註</Label>
              <Textarea
                id="edit-ingress_comment"
                rows={3}
                value={formData.ingress_comment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ingress_comment: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "更新中…" : "更新"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
