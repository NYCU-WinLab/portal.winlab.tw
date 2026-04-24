"use client"

import { useEffect, useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

export function SignaturePad({
  trigger,
  savedSignature,
  onConfirm,
}: {
  trigger: React.ReactNode
  savedSignature: string | null
  onConfirm: (dataUrl: string) => void
}) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<SignatureCanvas | null>(null)
  const canvasBoxRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(400)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [tab, setTab] = useState<"draw" | "upload">("draw")

  // Canvas attribute width is a pixel buffer, not CSS. Sync to container
  // width so it never overflows the dialog.
  useEffect(() => {
    if (!open || tab !== "draw") return
    const el = canvasBoxRef.current
    if (!el) return
    setCanvasWidth(Math.max(100, Math.floor(el.clientWidth)))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setCanvasWidth(Math.max(100, Math.floor(w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, tab])

  function confirm() {
    let dataUrl: string | null = null
    if (tab === "draw") {
      const c = canvasRef.current
      if (!c || c.isEmpty()) return
      dataUrl = c.getCanvas().toDataURL("image/png")
    } else {
      dataUrl = uploaded
    }
    if (!dataUrl) return
    onConfirm(dataUrl)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>簽名</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "draw" | "upload")}>
          <TabsList>
            <TabsTrigger value="draw">手繪</TabsTrigger>
            <TabsTrigger value="upload">上傳</TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="space-y-2">
            <div
              ref={canvasBoxRef}
              className="overflow-hidden rounded border bg-white"
            >
              <SignatureCanvas
                key={canvasWidth}
                ref={canvasRef}
                canvasProps={{
                  width: canvasWidth,
                  height: 180,
                  className: "block",
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => canvasRef.current?.clear()}
            >
              清除
            </Button>
          </TabsContent>
          <TabsContent value="upload" className="space-y-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => setUploaded(String(reader.result))
                reader.onerror = () => {
                  console.error("[approve] FileReader failed", reader.error)
                  toast.error("檔案讀取失敗")
                }
                reader.readAsDataURL(f)
              }}
            />
            {uploaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploaded}
                alt="signature preview"
                className="max-h-40 rounded border bg-white"
              />
            )}
          </TabsContent>
        </Tabs>

        {savedSignature && (
          <div className="flex items-center gap-2 rounded border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={savedSignature}
              alt="last signature"
              className="h-12 bg-white"
            />
            <span className="text-xs text-muted-foreground">上次簽名</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                onConfirm(savedSignature)
                setOpen(false)
              }}
            >
              套用
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={confirm}>確認</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
