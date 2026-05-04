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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import type { EgressStatus, Reimbursement } from "@/lib/reimburse/types"

import { updateEgressAction } from "../actions"

interface EditEgressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Reimbursement
}

function toFormData(data: Reimbursement) {
  return {
    applicant_name: data.applicantName,
    item_name: data.itemName,
    item_amount: data.itemAmount.toString(),
    item_comment: data.itemComment ?? "",
    invoice_date: data.invoiceDate,
    transfer_date: data.transferDate ?? "",
    transfer_fee: data.transferFee?.toString() ?? "",
    status: data.status,
  }
}

export function EditEgressDialog({
  open,
  onOpenChange,
  data,
}: EditEgressDialogProps) {
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
      const result = await updateEgressAction(data.id, {
        applicant_name: formData.applicant_name,
        item_name: formData.item_name,
        item_amount: parseFloat(formData.item_amount),
        item_comment: formData.item_comment || null,
        invoice_date: formData.invoice_date,
        transfer_date: formData.transfer_date || null,
        transfer_fee: formData.transfer_fee
          ? parseFloat(formData.transfer_fee)
          : null,
        status: formData.status,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯支出記錄</DialogTitle>
            <DialogDescription>請修改以下資訊</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-applicant_name">
                  申請人 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-applicant_name"
                  value={formData.applicant_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      applicant_name: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-item_name">
                  項目名稱 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-item_name"
                  value={formData.item_name}
                  onChange={(e) =>
                    setFormData({ ...formData, item_name: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-item_amount">
                  金額 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-item_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.item_amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      item_amount: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-invoice_date">
                  發票日期 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-invoice_date"
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      invoice_date: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-item_comment">備註</Label>
              <Textarea
                id="edit-item_comment"
                rows={3}
                value={formData.item_comment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    item_comment: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-transfer_date">轉帳日期</Label>
                <Input
                  id="edit-transfer_date"
                  type="date"
                  value={formData.transfer_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transfer_date: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-transfer_fee">轉帳手續費</Label>
                <Input
                  id="edit-transfer_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.transfer_fee}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transfer_fee: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">狀態</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as EgressStatus,
                  })
                }
              >
                <SelectTrigger id="edit-status" className="w-full">
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待審核</SelectItem>
                  <SelectItem value="approved">已審核</SelectItem>
                  <SelectItem value="rejected">已拒絕</SelectItem>
                </SelectContent>
              </Select>
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
