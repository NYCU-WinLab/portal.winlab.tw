"use client"

import { useEffect, useState } from "react"
import { IconKeyboard, IconX } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import {
  GALLERY_LIGHTBOX_SHORTCUTS,
  GALLERY_WALL_SHORTCUTS,
  isCheatSheetToggleKey,
  type GalleryShortcutRow,
} from "@/lib/gallery/keyboard-cheatsheet"
import { isTypingTarget } from "@/lib/gallery/keyboard"

function ShortcutTable({ rows }: { rows: GalleryShortcutRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.action}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span className="text-muted-foreground">{row.action}</span>
          <span className="flex shrink-0 items-center gap-1">
            {row.keys.map((key) => (
              <kbd
                key={key}
                className="inline-flex min-w-6 items-center justify-center rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
              >
                {key}
              </kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function GalleryKeyboardCheatsheet({
  lightboxOpen = false,
}: {
  lightboxOpen?: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (!isCheatSheetToggleKey(event.key, event.shiftKey)) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          gallerySans(),
          "inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors",
          "hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        )}
      >
        <IconKeyboard className="size-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className={cn(
            "fixed right-4 bottom-4 z-[95] w-[min(20rem,calc(100vw-2rem))]",
            "rounded-xl border border-border/70 bg-background/95 p-4 shadow-xl backdrop-blur-md",
            "gallery-cheatsheet-enter"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className={cn(gallerySerif(), "text-base text-foreground")}>
                Shortcuts
              </p>
              <p
                className={cn(
                  gallerySans(),
                  "mt-0.5 text-[11px] text-muted-foreground"
                )}
              >
                {lightboxOpen ? "While viewing a photo" : "On the wall"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close shortcuts"
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <IconX className="size-3.5" aria-hidden />
            </button>
          </div>
          <ShortcutTable
            rows={
              lightboxOpen ? GALLERY_LIGHTBOX_SHORTCUTS : GALLERY_WALL_SHORTCUTS
            }
          />
        </div>
      ) : null}
    </>
  )
}
