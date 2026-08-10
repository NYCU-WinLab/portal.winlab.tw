"use client"

import { useState } from "react"
import { IconFileZip } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { downloadSequenceZip } from "@/lib/gallery/download-sequence"
import {
  buildSequenceZipFilename,
  type SequenceZipSource,
} from "@/lib/gallery/zip-names"
import {
  describeZipBusyLabel,
  describeZipPreparingProgress,
} from "@/lib/gallery/zip-progress"
import { describeSequenceZipSaved } from "@/lib/gallery/sequence-zip-result"

type DownloadSequenceButtonProps = {
  items: SequenceZipSource[]
  /** Cover / story title used for the ZIP filename. */
  coverName?: string
  className?: string
  /** Icon-only chrome control (lightbox). */
  variant?: "icon" | "pill" | "text"
  label?: string
  disabled?: boolean
}

export function DownloadSequenceButton({
  items,
  coverName,
  className,
  variant = "pill",
  label,
  disabled = false,
}: DownloadSequenceButtonProps) {
  const [busy, setBusy] = useState(false)
  const shotCount = items.length
  const buttonLabel =
    label ??
    (shotCount > 1 ? `Download story (${shotCount})` : "Download story")

  const runDownload = async () => {
    if (busy || disabled || shotCount < 2) return
    setBusy(true)
    const toastId = toast.loading(
      describeZipPreparingProgress({
        completed: 0,
        total: shotCount,
        noun: "story",
      })
    )
    try {
      const result = await downloadSequenceZip(items, {
        zipName: coverName ? buildSequenceZipFilename(coverName) : undefined,
        onProgress: ({ completed, total }) => {
          toast.loading(
            describeZipPreparingProgress({
              completed,
              total,
              noun: "story",
            }),
            {
              id: toastId,
            }
          )
        },
      })
      toast.success(describeSequenceZipSaved(result.count), { id: toastId })
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
        disabled={busy || disabled || shotCount < 2}
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
        disabled={busy || disabled || shotCount < 2}
        aria-busy={busy}
        className={cn(
          "text-[11px] text-muted-foreground/80 underline-offset-2",
          "hover:text-foreground hover:underline disabled:opacity-50",
          className
        )}
      >
        {busy ? describeZipBusyLabel() : buttonLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void runDownload()}
      disabled={busy || disabled || shotCount < 2}
      aria-busy={busy}
      className={cn(
        "inline-flex items-center gap-1.5 disabled:opacity-50",
        className
      )}
    >
      <IconFileZip className="size-3.5" aria-hidden />
      {busy ? describeZipBusyLabel() : buttonLabel}
    </button>
  )
}
