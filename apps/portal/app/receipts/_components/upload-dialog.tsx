"use client"

import { Plus } from "lucide-react"
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

import { useUploadReceipt } from "@/hooks/receipts/use-receipts"
import { isSupportedReceiptFile } from "@/lib/receipts/file"

export function UploadDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const upload = useUploadReceipt()

  const reset = () => {
    setName("")
    setFile(null)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) {
      toast.error("請選一張收據圖片或 PDF")
      return
    }
    if (!isSupportedReceiptFile(file)) {
      toast.error("只支援 JPG / PNG / WebP / PDF — HEIC 請先轉檔")
      return
    }

    upload.mutate(
      { name: name.trim(), file },
      {
        onSuccess: () => {
          toast.success("已上傳")
          setOpen(false)
          reset()
        },
        onError: (err) => toast.error(`上傳失敗：${err.message}`),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          上傳收據
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>上傳收據</DialogTitle>
            <DialogDescription>
              圖片會自動包成 PDF；PDF 直接保留。預設狀態為「審核中」。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="receipt-name">
                名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="receipt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：Amazon 鍵盤"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt-file">
                收據檔案 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
              <p className="text-xs text-muted-foreground">
                JPG / PNG / WebP / PDF
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={upload.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? "上傳中…" : "上傳"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
