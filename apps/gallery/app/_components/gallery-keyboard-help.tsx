"use client"

import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"

const STORAGE_KEY = "gallery-keyboard-help-dismissed"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <kbd
        className={cn(
          gallerySans(),
          "rounded border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] text-foreground"
        )}
      >
        {keys}
      </kbd>
    </div>
  )
}

export function GalleryKeyboardHelp({
  lightboxOpen = false,
}: {
  lightboxOpen?: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      if (isTypingTarget(event.target)) return
      if (event.key !== "?" && event.key !== "/") return
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) return

      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (localStorage.getItem(STORAGE_KEY) === "1") return
    const timer = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(timer)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={cn(gallerySans(), "max-w-sm")}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <ShortcutRow keys="j / k" label="Move focus on wall" />
          <ShortcutRow keys="Enter" label="Open focused photo" />
          {lightboxOpen ? (
            <>
              <ShortcutRow keys="← / →" label="Previous / next photo" />
              <ShortcutRow keys="Esc" label="Close lightbox" />
            </>
          ) : null}
          <ShortcutRow keys="?" label="Show this help" />
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-full border border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground"
        >
          Got it
        </button>
      </DialogContent>
    </Dialog>
  )
}
