"use client"

import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"

const DISMISS_KEY = "gallery-offline-banner-dismissed"

export function GalleryOfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine)
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
    }
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  if (!offline || dismissed) return null

  return (
    <div
      role="status"
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
            You&apos;re offline
          </p>
          <p
            className={cn(
              gallerySans(),
              "mt-0.5 text-xs text-muted-foreground"
            )}
          >
            Cached wall photos may still open. Uploads, comments, and reactions
            need a network connection.
          </p>
        </div>
        <button
          type="button"
          className={cn(
            gallerySans(),
            "shrink-0 text-xs text-muted-foreground underline underline-offset-4"
          )}
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1")
            setDismissed(true)
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
