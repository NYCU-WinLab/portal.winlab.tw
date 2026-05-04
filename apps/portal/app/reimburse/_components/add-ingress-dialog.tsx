"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { Textarea } from "@workspace/ui/components/textarea"

import { addIngressAction } from "../actions"

const EMPTY_FORM = {
  ingress_date: "",
  ingress_amount: "",
  ingress_comment: "",
}

export function AddIngressDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await addIngressAction({
        ingress_date: formData.ingress_date,
        ingress_amount: parseFloat(formData.ingress_amount),
        ingress_comment: formData.ingress_comment || null,
        ingress_files: [],
      })

      if (result.success) {
        setOpen(false)
        setFormData(EMPTY_FORM)
        router.refresh()
        toast.success("已新增收入")
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          新增收入
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新增收入記錄</DialogTitle>
            <DialogDescription>請填寫以下資訊以新增收入記錄</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ingress_date">
                  日期 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ingress_date"
                  type="date"
                  value={formData.ingress_date}
                  onChange={(e) =>
                    setFormData({ ...formData, ingress_date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ingress_amount">
                  金額 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="ingress_amount"
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
              <Label htmlFor="ingress_comment">備註</Label>
              <Textarea
                id="ingress_comment"
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
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "新增中…" : "新增"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
