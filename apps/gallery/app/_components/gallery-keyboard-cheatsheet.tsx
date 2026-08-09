"use client"

import { useEffect, useRef, useState } from "react"
import { IconKeyboard, IconX } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import {
  GALLERY_LIGHTBOX_SHORTCUTS,
  GALLERY_MANAGE_SHORTCUTS,
  GALLERY_SLIDESHOW_SHORTCUTS,
  GALLERY_WALL_SHORTCUTS,
  isCheatSheetToggleKey,
  type GalleryShortcutRow,
} from "@/lib/gallery/keyboard-cheatsheet"
import { isTypingTarget } from "@/lib/gallery/keyboard"

function ShortcutTable({
  rows,
  dark = false,
}: {
  rows: GalleryShortcutRow[]
  dark?: boolean
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.action}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span className={dark ? "text-zinc-400" : "text-muted-foreground"}>
            {row.action}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {row.keys.map((key) => (
              <kbd
                key={key}
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px]",
                  dark
                    ? "border-white/15 bg-white/10 text-zinc-100"
                    : "border-border/70 bg-muted/60 text-foreground"
                )}
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
  slideshowOpen = false,
  manage = false,
  dark = false,
  className,
}: {
  lightboxOpen?: boolean
  slideshowOpen?: boolean
  /** Use on /upload Manage Select shortcuts. */
  manage?: boolean
  /** Use on the dark fullscreen slideshow chrome. */
  dark?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const setSheetOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      queueMicrotask(() => triggerRef.current?.focus())
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      // Capture Esc so wall/Manage Select listeners do not run first.
      if (open && event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        setSheetOpen(false)
        return
      }

      if (!isCheatSheetToggleKey(event.key, event.shiftKey)) return
      event.preventDefault()
      setSheetOpen(!open)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])

  const primaryRows = slideshowOpen
    ? GALLERY_SLIDESHOW_SHORTCUTS
    : lightboxOpen
      ? GALLERY_LIGHTBOX_SHORTCUTS
      : manage
        ? GALLERY_MANAGE_SHORTCUTS
        : GALLERY_WALL_SHORTCUTS

  const contextLabel = slideshowOpen
    ? "During slideshow"
    : lightboxOpen
      ? "While viewing a photo"
      : manage
        ? "On Manage (Select mode)"
        : "On the wall"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        onClick={() => setSheetOpen(!open)}
        className={cn(
          gallerySans(),
          "inline-flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          dark
            ? "border-white/15 bg-white/10 text-zinc-200 hover:bg-white/15 hover:text-zinc-50"
            : "border-border/60 bg-background/80 text-muted-foreground hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground",
          className
        )}
      >
        <IconKeyboard className="size-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          className={cn(
            "fixed right-4 bottom-4 z-[95] w-[min(20rem,calc(100vw-2rem))]",
            "rounded-xl border p-4 shadow-xl backdrop-blur-md",
            "gallery-cheatsheet-enter",
            dark
              ? "border-white/15 bg-zinc-950/95 text-zinc-50"
              : "border-border/70 bg-background/95"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p
                className={cn(
                  gallerySerif(),
                  "text-base",
                  dark ? "text-zinc-50" : "text-foreground"
                )}
              >
                Shortcuts
              </p>
              <p
                className={cn(
                  gallerySans(),
                  "mt-0.5 text-[11px]",
                  dark ? "text-zinc-400" : "text-muted-foreground"
                )}
              >
                {contextLabel}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close shortcuts"
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full",
                dark
                  ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-50"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => setSheetOpen(false)}
            >
              <IconX className="size-3.5" aria-hidden />
            </button>
          </div>
          <ShortcutTable rows={primaryRows} dark={dark} />
          {!slideshowOpen && !manage ? (
            <div
              className={cn(
                "mt-4 border-t pt-3",
                dark ? "border-white/10" : "border-border/50"
              )}
            >
              <p
                className={cn(
                  gallerySans(),
                  "mb-2 text-[10px] tracking-wide uppercase",
                  dark ? "text-zinc-500" : "text-muted-foreground"
                )}
              >
                Slideshow
              </p>
              <ShortcutTable
                rows={GALLERY_SLIDESHOW_SHORTCUTS.filter(
                  (row) => row.keys[0] !== "?"
                )}
                dark={dark}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
