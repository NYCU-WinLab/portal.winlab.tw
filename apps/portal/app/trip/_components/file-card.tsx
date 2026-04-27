"use client"

import { Download, ExternalLink, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import {
  useDeleteTripFile,
  useDownloadSingleFile,
  useOpenTripFile,
} from "@/hooks/trip/use-trip-files"
import type { TripFileWithUser } from "@/lib/trip/types"

import { ConfirmDialog } from "./confirm-dialog"
import { EditDescriptionDialog } from "./edit-description-dialog"

export function FileCard({
  tripId,
  file,
  canEdit,
  canDelete,
}: {
  tripId: string
  file: TripFileWithUser
  canEdit: boolean
  canDelete: boolean
}) {
  const deleteFile = useDeleteTripFile(tripId)
  const openFile = useOpenTripFile()
  const downloadFile = useDownloadSingleFile()

  const handleDelete = async () => {
    try {
      await deleteFile.mutateAsync({
        id: file.id,
        storage_path: file.storage_path,
      })
      toast.success("已刪除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刪除失敗")
    }
  }

  const handleOpen = async () => {
    try {
      await openFile.mutateAsync({
        storage_path: file.storage_path,
        filename: file.filename,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "開啟失敗")
    }
  }

  const handleDownload = async () => {
    try {
      await downloadFile.mutateAsync({
        storage_path: file.storage_path,
        filename: file.filename,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下載失敗")
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{file.filename}</span>
        {file.description ? (
          <p className="truncate text-sm text-muted-foreground">
            {file.description}
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {formatBytes(file.size_bytes)}
          </p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="開啟"
        onClick={handleOpen}
      >
        <ExternalLink className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="下載"
        onClick={handleDownload}
      >
        <Download className="size-4" />
      </Button>
      {canEdit && (
        <EditDescriptionDialog
          tripId={tripId}
          fileId={file.id}
          current={file.description}
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label="編輯描述"
            >
              <Pencil className="size-4" />
            </Button>
          }
        />
      )}
      {canDelete && (
        <ConfirmDialog
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label="刪除"
            >
              <Trash2 className="size-4" />
            </Button>
          }
          title="刪除這個檔案？"
          description={file.filename}
          confirmText="刪除"
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function formatBytes(n: number | null): string {
  if (!n) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
