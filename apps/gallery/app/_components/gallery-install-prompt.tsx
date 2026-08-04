"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

import { IconDownload, IconShare2, IconX } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import {
  GALLERY_PWA_INSTALL_DISMISS_KEY,
  isIosDevice,
  isStandaloneDisplayMode,
} from "@/lib/gallery/pwa"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function GalleryInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (window.localStorage.getItem(GALLERY_PWA_INSTALL_DISMISS_KEY) === "1") {
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
    window.localStorage.setItem(GALLERY_PWA_INSTALL_DISMISS_KEY, "1")
    setVisible(false)
    setDeferredPrompt(null)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    dismiss()
  }

  if (!visible) return null

  return (
    <div
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
          <p className="text-sm font-medium text-foreground">
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
            <Button type="button" size="sm" onClick={() => void install()}>
              <IconDownload className="h-4 w-4" />
              Install
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
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
