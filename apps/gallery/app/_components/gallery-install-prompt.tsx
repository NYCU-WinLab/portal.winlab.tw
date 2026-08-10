"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"

import { IconDownload, IconShare2, IconX } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { describeInstallingLabel } from "@/lib/gallery/busy-labels"
import {
  GALLERY_PWA_INSTALL_DISMISS_KEY,
  isIosDevice,
  isStandaloneDisplayMode,
} from "@/lib/gallery/pwa"
import { readStorageItem, writeStorageItem } from "@/lib/gallery/safe-storage"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function GalleryInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (
      readStorageItem(window.localStorage, GALLERY_PWA_INSTALL_DISMISS_KEY) ===
      "1"
    ) {
      return
    }

    const standalone = isStandaloneDisplayMode(
      window.matchMedia("(display-mode: standalone)").matches,
      (
        navigator as Navigator & {
          standalone?: boolean
        }
      ).standalone === true
    )
    if (standalone) return

    const mobile = window.matchMedia("(max-width: 767px)").matches
    if (!mobile) return

    if (isIosDevice(navigator.userAgent)) {
      setIosHint(true)
      setVisible(true)
      return
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    }
  }, [])

  const dismiss = () => {
    if (busy) return
    writeStorageItem(window.localStorage, GALLERY_PWA_INSTALL_DISMISS_KEY, "1")
    setVisible(false)
    setDeferredPrompt(null)
  }

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      dismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visible, busy])

  useEffect(() => {
    if (!visible) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    restoreFocusRef.current = previous
    queueMicrotask(() => primaryActionRef.current?.focus())
    return () => {
      const restore = restoreFocusRef.current
      restoreFocusRef.current = null
      queueMicrotask(() => restore?.focus())
    }
  }, [visible])

  const install = async () => {
    if (!deferredPrompt || busy) return
    setBusy(true)
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      // Browser cancelled / blocked the install sheet — still dismiss.
    } finally {
      setBusy(false)
    }
    dismiss()
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-install-prompt-title"
      className={cn(
        gallerySans(),
        "fixed inset-x-0 bottom-0 z-[90] px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
      )}
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-zinc-900/10 bg-[#fafafa]/95 p-4 shadow-[0_12px_40px_-16px_rgba(24,24,27,0.35)] backdrop-blur-sm">
        <Image
          src="/icons/mark.png"
          alt=""
          width={40}
          height={40}
          className="mt-0.5 size-10 shrink-0 rounded-md border border-zinc-900/10 bg-white object-contain p-1 shadow-sm"
          draggable={false}
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <p
            id="gallery-install-prompt-title"
            className="text-sm font-medium text-foreground"
          >
            Keep Gallery in your pocket
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {iosHint ? (
              <>
                Tap{" "}
                <IconShare2 className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
                Share, then &ldquo;Add to Home Screen&rdquo; for a full-screen
                app experience.
              </>
            ) : (
              "Add Gallery to your home screen for quick access and a cleaner full-screen view."
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!iosHint ? (
            <Button
              ref={primaryActionRef}
              type="button"
              size="sm"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => void install()}
            >
              <IconDownload className="h-4 w-4" />
              {busy ? describeInstallingLabel() : "Install"}
            </Button>
          ) : null}
          <Button
            ref={iosHint ? primaryActionRef : undefined}
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label="Dismiss install prompt"
            onClick={dismiss}
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
