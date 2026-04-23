"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { IconUpload } from "@tabler/icons-react"

import { uploadPdf } from "../actions"

export function UploadZone({
  documentId,
  onUploaded,
}: {
  documentId: string
  onUploaded: (filePath: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function handle(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("只收 PDF")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("PDF 超過 50MB")
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.set("documentId", documentId)
      form.set("file", file)
      await uploadPdf(form)
      onUploaded(`${documentId}/original.pdf`)
      toast.success("PDF 已上傳")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed text-muted-foreground hover:bg-muted/40">
      <IconUpload className="size-6" />
      <span>{busy ? "上傳中..." : "點這裡選 PDF"}</span>
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handle(f)
        }}
      />
      <Button type="button" variant="ghost" size="sm" tabIndex={-1}>
        或拖放 PDF 到這裡（稍後支援）
      </Button>
    </label>
  )
}
