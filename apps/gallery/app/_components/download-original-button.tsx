"use client"

import { useState } from "react"
import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { downloadGalleryOriginal } from "@/lib/gallery/download-original"

type DownloadOriginalButtonProps = {
  displayName: string
  imagePath: string
  className?: string
  disabled?: boolean
}

/** Lightbox / chrome control — blob download so cross-origin originals save. */
export function DownloadOriginalButton({
  displayName,
  imagePath,
  className,
  disabled = false,
}: DownloadOriginalButtonProps) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (busy || disabled || !imagePath.trim()) return
    setBusy(true)
    try {
      await downloadGalleryOriginal({ displayName, imagePath })
      toast.success("Saved original")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not download"
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || disabled || !imagePath.trim()}
      aria-label="Save original"
      aria-busy={busy}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full",
        "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
        "transition-colors hover:bg-white disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
        className
      )}
    >
      <IconDownload className="h-5 w-5" />
    </button>
  )
}
