"use client"

import { Pencil, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"

import { SignaturePad } from "@/components/signature-pad"
import { useSignPrefs, useUpdateSignPrefs } from "@/hooks/trip/use-sign-prefs"
import { useUploadTripFiles } from "@/hooks/trip/use-trip-files"
import {
  useSavedSignature,
  useSaveSignature,
} from "@/hooks/use-saved-signature"
import { TRIP_FILE_ACCEPT } from "@/lib/trip/convert"
import { SIGNATURE_POSITIONS, type SignaturePosition } from "@/lib/trip/sign"

export function UploadZone({
  tripId,
  userId,
}: {
  tripId: string
  userId: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const upload = useUploadTripFiles(tripId)

  const { signature } = useSavedSignature(userId)
  const saveSignature = useSaveSignature(userId)
  const { prefs } = useSignPrefs(userId)
  const updatePrefs = useUpdateSignPrefs(userId)

  const onAutoSignChange = async (next: boolean) => {
    if (next && !signature) {
      toast.error("還沒設定簽名 — 先按「設定簽名」")
      return
    }
    try {
      await updatePrefs.mutateAsync({ enabled: next })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存偏好失敗")
    }
  }

  const onCornerChange = async (next: SignaturePosition) => {
    try {
      await updatePrefs.mutateAsync({ corner: next })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存偏好失敗")
    }
  }

  const handleSignatureConfirm = async (dataUrl: string) => {
    try {
      await saveSignature.mutateAsync(dataUrl)
      toast.success("簽名已儲存")
      if (!prefs.enabled) {
        await updatePrefs.mutateAsync({ enabled: true })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存簽名失敗")
    }
  }

  const startUpload = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return

    setProgress({ done: 0, total: files.length })
    try {
      await upload.mutateAsync({
        userId,
        files,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      toast.success(
        files.length === 1 ? "已上傳" : `已上傳 ${files.length} 個檔案`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上傳失敗")
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const isUploading = upload.isPending

  return (
    <div className="flex flex-col gap-3">
      <div
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-8 text-center transition-colors",
          dragActive ? "border-foreground/50 bg-muted" : "border-border",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          if (!isUploading) startUpload(e.dataTransfer.files)
        }}
      >
        <Upload className="size-6 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {isUploading
              ? `上傳中… ${progress?.done ?? 0} / ${progress?.total ?? 0}`
              : "拖檔案進來，或點下方按鈕"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF / JPG / PNG / WebP — 圖片會在前端壓成 PDF 再上傳
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TRIP_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => startUpload(e.target.files)}
          disabled={isUploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          選擇檔案
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={prefs.enabled}
            onCheckedChange={(v) => onAutoSignChange(v === true)}
            disabled={updatePrefs.isPending}
          />
          <span className="text-sm">自動簽名（每頁）</span>
        </label>

        {prefs.enabled && (
          <div className="flex items-center gap-1">
            {SIGNATURE_POSITIONS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={prefs.corner === p.id ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onCornerChange(p.id)}
                disabled={updatePrefs.isPending}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}

        <SignaturePad
          trigger={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2 text-xs"
            >
              <Pencil className="size-3" />
              {signature ? "編輯簽名" : "設定簽名"}
            </Button>
          }
          savedSignature={signature}
          onConfirm={handleSignatureConfirm}
        />
      </div>
    </div>
  )
}
