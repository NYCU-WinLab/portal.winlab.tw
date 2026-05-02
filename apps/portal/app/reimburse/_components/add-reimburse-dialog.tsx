"use client"

import { Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { REIMBURSE_BUCKETS } from "@/lib/reimburse/types"

interface FormState {
  applicant_name: string
  item_name: string
  item_amount: string
  item_comment: string
  invoice_date: string
}

const EMPTY_FORM: FormState = {
  applicant_name: "",
  item_name: "",
  item_amount: "",
  item_comment: "",
  invoice_date: "",
}

const SIGNATURE_BG = "#f8fafc"

export function AddReimburseDialog() {
  const supabase = createClient()
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoicePath, setInvoicePath] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const [signaturePath, setSignaturePath] = useState<string | null>(null)
  const [loadingSignature, setLoadingSignature] = useState(false)

  const fillCanvasWhite = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = SIGNATURE_BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Reload signature each time the dialog opens. Saved at
  // reimburse-signatures/signatures/<userId>.png — same convention as the old
  // standalone reimburse app, so existing signatures keep working.
  useEffect(() => {
    if (!open || !user) return

    let cancelled = false
    const path = `signatures/${user.id}.png`

    const load = async () => {
      setLoadingSignature(true)
      fillCanvasWhite()
      try {
        const { data, error } = await supabase.storage
          .from(REIMBURSE_BUCKETS.signatures)
          .createSignedUrl(path, 60)
        if (cancelled) return
        if (error || !data?.signedUrl) {
          setSignaturePath(null)
          return
        }
        setSignaturePath(path)
        const blob = await (await fetch(data.signedUrl)).blob()
        if (cancelled) return
        const img = new Image()
        img.onload = () => {
          if (cancelled) return
          const canvas = canvasRef.current
          if (!canvas) return
          const ctx = canvas.getContext("2d")
          if (!ctx) return
          fillCanvasWhite()
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        img.src = URL.createObjectURL(blob)
      } catch (err) {
        if (!cancelled) console.error("[reimburse] load signature failed", err)
      } finally {
        if (!cancelled) setLoadingSignature(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, supabase, user])

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      canvas,
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    if (!point) return
    const ctx = point.canvas.getContext("2d")
    if (!ctx) return
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    isDrawingRef.current = true
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const point = getCanvasPoint(e)
    if (!point) return
    const ctx = point.canvas.getContext("2d")
    if (!ctx) return
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const handleMouseUp = () => {
    isDrawingRef.current = false
  }

  const handleClearSignature = () => {
    fillCanvasWhite()
    setSignaturePath(null)
  }

  const uploadInvoice = async (): Promise<string | null> => {
    if (!user || !invoiceFile) return null
    const ext = invoiceFile.name.split(".").pop() ?? "pdf"
    const path = `${user.id}/invoices/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from(REIMBURSE_BUCKETS.invoices)
      .upload(path, invoiceFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      })
    if (error) {
      console.error("[reimburse] upload invoice failed", error)
      toast.error("上傳發票失敗")
      return null
    }
    setInvoicePath(path)
    return path
  }

  const uploadSignature = async (): Promise<string | null> => {
    if (!user) return null
    const canvas = canvasRef.current
    if (!canvas) return null

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    )
    if (!blob) {
      toast.error("簽名讀取失敗，請重試")
      return null
    }

    const path = `signatures/${user.id}.png`
    const { error } = await supabase.storage
      .from(REIMBURSE_BUCKETS.signatures)
      .upload(path, blob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/png",
      })
    if (error) {
      console.error("[reimburse] upload signature failed", error)
      toast.error("上傳簽名失敗")
      return null
    }
    setSignaturePath(path)
    return path
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) {
      toast.error("請先登入")
      return
    }
    setLoading(true)
    try {
      const [invoiceStoragePath, signatureStoragePath] = await Promise.all([
        invoicePath ? Promise.resolve(invoicePath) : uploadInvoice(),
        signaturePath ? Promise.resolve(signaturePath) : uploadSignature(),
      ])

      if (!invoiceStoragePath || !signatureStoragePath) return

      const res = await fetch("/api/reimburse/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_name: formData.applicant_name,
          item_name: formData.item_name,
          item_amount: parseFloat(formData.item_amount),
          item_comment: formData.item_comment || null,
          invoice_date: formData.invoice_date,
          invoice_path: invoiceStoragePath,
          signature_path: signatureStoragePath,
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string
        } | null
        toast.error(body?.message ?? "產生報帳 PDF 失敗")
        return
      }

      toast.success("已產生並上傳報帳 PDF")
      setOpen(false)
      setFormData(EMPTY_FORM)
      setInvoiceFile(null)
      setInvoicePath(null)
    } catch (err) {
      console.error("[reimburse] submit failed", err)
      toast.error("上傳報帳失敗")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          上傳報帳
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>上傳報帳</DialogTitle>
            <DialogDescription>
              上傳 PDF 電子發票，並於下方框框簽名，系統會自動產生支出證明單 PDF
              並儲存。
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="applicant_name">
                申請人 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="applicant_name"
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
              <Label htmlFor="item_name">
                支出事由 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="item_name"
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
              <Label htmlFor="item_amount">
                金額 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="item_amount"
                type="number"
                min="0"
                step="1"
                value={formData.item_amount}
                onChange={(e) =>
                  setFormData({ ...formData, item_amount: e.target.value })
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice_date">
                發票日期 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_date: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="item_comment">備註</Label>
            <Textarea
              id="item_comment"
              rows={3}
              value={formData.item_comment}
              onChange={(e) =>
                setFormData({ ...formData, item_comment: e.target.value })
              }
              placeholder="可填寫不能取得單據原因等說明"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice_file">
              電子發票（PDF） <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invoice_file"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setInvoiceFile(file)
                setInvoicePath(null)
              }}
              required={!invoiceFile}
            />
            {invoicePath && (
              <p className="text-xs text-muted-foreground">
                已上傳：{invoicePath}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>簽名</Label>
            <div className="rounded-md border bg-muted/40 p-2">
              <canvas
                ref={canvasRef}
                width={500}
                height={200}
                className="h-40 w-full cursor-crosshair rounded-sm border bg-white"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {loadingSignature
                    ? "載入簽名中…"
                    : signaturePath
                      ? "已載入先前簽名，如需重簽可清除後重新簽名。"
                      : "請於上方框框內以滑鼠簽名，簽名會自動保存供下次使用。"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearSignature}
                >
                  清除簽名
                </Button>
              </div>
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
              {loading ? "處理中…" : "確認產生報帳 PDF"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
