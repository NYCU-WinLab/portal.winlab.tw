"use client"

import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { readStorageItem, writeStorageItem } from "@/lib/gallery/safe-storage"
import {
  describeDismissOfflineLabel,
  describeOfflineBannerDescription,
  describeOfflineBannerTitle,
} from "@/lib/gallery/offline-banner-labels"

const DISMISS_KEY = "gallery-offline-banner-dismissed"

export function GalleryOfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [busy, setBusy] = useState(false)

  const dismiss = () => {
    if (busy) return
    setBusy(true)
    try {
      writeStorageItem(window.sessionStorage, DISMISS_KEY, "1")
      setDismissed(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine)
      setDismissed(readStorageItem(window.sessionStorage, DISMISS_KEY) === "1")
    }
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  const visible = offline && !dismissed

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // Leave Esc to modal dialogs / slideshow chrome when they are open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      dismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[60] border-t border-zinc-900/10",
        "bg-[#fafafa]/95 px-4 py-3 backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(gallerySans(), "text-sm font-medium text-foreground")}
          >
            {describeOfflineBannerTitle()}
          </p>
          <p
            className={cn(
              gallerySans(),
              "mt-0.5 text-xs text-muted-foreground"
            )}
          >
            {describeOfflineBannerDescription()}
          </p>
        </div>
        <button
          type="button"
          className={cn(
            gallerySans(),
            "shrink-0 text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-50"
          )}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={dismiss}
        >
          {describeDismissOfflineLabel()}
        </button>
      </div>
    </div>
  )
}
