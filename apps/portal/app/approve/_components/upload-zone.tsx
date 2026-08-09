"use client"

import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { IconUpload } from "@tabler/icons-react"

import { usePdfUpload } from "@/hooks/approve/use-pdf-upload"

export function UploadZone({
  documentId,
  onUploaded,
}: {
  documentId: string
  onUploaded: (filePath: string) => void
}) {
  const { upload, uploading } = usePdfUpload(documentId)

  async function handle(file: File) {
    try {
      const path = await upload(file)
      onUploaded(path)
      toast.success("PDF 已上傳")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed text-muted-foreground hover:bg-muted/40">
      <IconUpload className="size-6" />
      <span>{uploading ? "上傳中..." : "點這裡選 PDF"}</span>
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.currentTarget.value = ""
          if (f) handle(f)
        }}
      />
      <Button type="button" variant="ghost" size="sm" tabIndex={-1}>
        或拖放 PDF 到這裡（稍後支援）
      </Button>
    </label>
  )
}
