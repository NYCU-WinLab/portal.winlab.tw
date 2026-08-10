"use client"

import { useState } from "react"
import { IconFileZip } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { downloadAlbumZip } from "@/lib/gallery/download-album"
import {
  buildAlbumZipFilename,
  type AlbumZipSource,
} from "@/lib/gallery/zip-names"
import { describeZipDownloadResult } from "@/lib/gallery/zip-result"
import { describeZipPreparingProgress } from "@/lib/gallery/zip-progress"

type DownloadAlbumButtonProps = {
  items: AlbumZipSource[]
  /** Album title used for the ZIP filename. */
  albumTitle?: string
  className?: string
  variant?: "icon" | "pill" | "text"
  label?: string
  disabled?: boolean
}

export function DownloadAlbumButton({
  items,
  albumTitle,
  className,
  variant = "pill",
  label,
  disabled = false,
}: DownloadAlbumButtonProps) {
  const [busy, setBusy] = useState(false)
  const photoCount = items.length
  const buttonLabel =
    label ??
    (photoCount > 0 ? `Download album (${photoCount})` : "Download album")

  const runDownload = async () => {
    if (busy || disabled || photoCount < 1) return
    setBusy(true)
    const toastId = toast.loading(
      describeZipPreparingProgress({
        completed: 0,
        total: photoCount,
        noun: "album",
      })
    )
    try {
      const result = await downloadAlbumZip(items, {
        zipName: albumTitle ? buildAlbumZipFilename(albumTitle) : undefined,
        onProgress: ({ completed, total }) => {
          toast.loading(
            describeZipPreparingProgress({
              completed,
              total,
              noun: "album",
            }),
            {
              id: toastId,
            }
          )
        },
      })
      const copy = describeZipDownloadResult({
        count: result.count,
        failed: result.failed,
        noun: "photo",
      })
      if (copy.severity === "warning") {
        toast.warning(copy.title, {
          id: toastId,
          description: copy.description,
        })
      } else {
        toast.success(copy.title, { id: toastId })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not build the ZIP"
      toast.error(message, { id: toastId })
    } finally {
      setBusy(false)
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void runDownload()}
        disabled={busy || disabled || photoCount < 1}
        aria-label={buttonLabel}
        aria-busy={busy}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full",
          "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
          "transition-colors hover:bg-white disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
          className
        )}
      >
        <IconFileZip className="h-5 w-5" />
      </button>
    )
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={() => void runDownload()}
        disabled={busy || disabled || photoCount < 1}
        aria-busy={busy}
        className={cn(
          "text-[11px] text-muted-foreground/80 underline-offset-2",
          "hover:text-foreground hover:underline disabled:opacity-50",
          className
        )}
      >
        {busy ? "Preparing ZIP…" : buttonLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void runDownload()}
      disabled={busy || disabled || photoCount < 1}
      aria-busy={busy}
      className={cn(
        "inline-flex items-center gap-1.5 disabled:opacity-50",
        className
      )}
    >
      <IconFileZip className="size-3.5" aria-hidden />
      {busy ? "Preparing ZIP…" : buttonLabel}
    </button>
  )
}
