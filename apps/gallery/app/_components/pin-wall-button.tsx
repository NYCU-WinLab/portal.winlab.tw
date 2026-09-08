"use client"

import { useEffect, useState, useTransition, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { setGalleryImagePin } from "@/app/actions"
import { galleryPillClass } from "@/components/gallery-chrome"
import {
  describePinChromeLabel,
  describePinToast,
} from "@/lib/gallery/pin-toast"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"
import { cn } from "@workspace/ui/lib/utils"

export function PinWallButton({
  imageId,
  pinnedAt: pinnedAtProp,
  onPinnedChange,
  scrollToWallTop = false,
  navigateHomeOnPin = false,
  className,
  stopPropagation = false,
}: {
  imageId: string
  pinnedAt: string | null
  onPinnedChange?: (pinnedAt: string | null) => void
  scrollToWallTop?: boolean
  navigateHomeOnPin?: boolean
  className?: string
  stopPropagation?: boolean
}) {
  const router = useRouter()
  const [pinnedAt, setPinnedAt] = useState(pinnedAtProp)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setPinnedAt(pinnedAtProp)
  }, [pinnedAtProp])

  const toggle = (event?: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event?.preventDefault()
      event?.stopPropagation()
    }
    if (isPending) return

    startTransition(async () => {
      const nextPinned = !pinnedAt
      const result = await setGalleryImagePin(imageId, nextPinned)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPinnedAt(result.data.pinned_at)
      onPinnedChange?.(result.data.pinned_at)
      toast.success(describePinToast(nextPinned))
      if (nextPinned && navigateHomeOnPin) {
        try {
          router.push("/")
        } catch {
          toast.error(describeGalleryNavError("openWallHome"))
        }
        return
      }
      if (nextPinned && scrollToWallTop) {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
      try {
        router.refresh()
      } catch {
        toast.error(describeGalleryNavError("refreshGalleryChrome"))
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={Boolean(pinnedAt)}
      aria-busy={isPending || undefined}
      className={cn(
        galleryPillClass(),
        pinnedAt && "text-amber-800",
        className
      )}
    >
      {describePinChromeLabel(Boolean(pinnedAt))}
    </button>
  )
}
