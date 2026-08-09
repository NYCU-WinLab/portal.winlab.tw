"use client"

import { useState } from "react"
import { IconLink, IconShare2 } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { shareOrCopyAlbumLink } from "@/lib/gallery/album-share"
import { gallerySans } from "@/components/gallery-chrome"

type ShareAlbumButtonProps = {
  slug: string
  title: string
  className?: string
  variant?: "text" | "button" | "icon"
  /** Emphasize for owners who need an obvious copy-link affordance. */
  emphasize?: boolean
  label?: string
  disabled?: boolean
}

export function ShareAlbumButton({
  slug,
  title,
  className,
  variant = "button",
  emphasize = false,
  label,
  disabled = false,
}: ShareAlbumButtonProps) {
  const [busy, setBusy] = useState(false)
  const buttonLabel = label ?? (emphasize ? "Copy share link" : "Share album")

  const runShare = async () => {
    if (busy || disabled) return
    setBusy(true)
    try {
      const mode = await shareOrCopyAlbumLink({ slug, title })
      if (mode === "copied") {
        toast.success("Share link copied")
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error(
        error instanceof Error ? error.message : "Could not share album link"
      )
    } finally {
      setBusy(false)
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void runShare()}
        disabled={busy || disabled}
        aria-label={buttonLabel}
        aria-busy={busy}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background shadow-xs",
          "hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
          className
        )}
      >
        <IconShare2 className="size-4" aria-hidden />
      </button>
    )
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={() => void runShare()}
        disabled={busy || disabled}
        aria-busy={busy}
        className={cn(
          gallerySans(),
          "inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 underline-offset-2",
          "hover:text-foreground hover:underline disabled:opacity-50",
          emphasize && "font-medium text-foreground",
          className
        )}
      >
        <IconLink className="size-3.5 shrink-0" aria-hidden />
        {busy ? "Sharing…" : buttonLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void runShare()}
      disabled={busy || disabled}
      aria-busy={busy}
      className={cn(
        gallerySans(),
        "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
        "hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        emphasize &&
          "border-foreground/25 bg-foreground text-background hover:bg-foreground/90 hover:text-background",
        className
      )}
    >
      <IconLink className="size-3.5" aria-hidden />
      {busy ? "Sharing…" : buttonLabel}
    </button>
  )
}
