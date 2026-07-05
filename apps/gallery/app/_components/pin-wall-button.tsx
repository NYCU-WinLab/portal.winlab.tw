"use client"

import { useEffect, useState, useTransition, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { setGalleryImagePin } from "@/app/actions"
import { galleryPillClass } from "@/components/gallery-chrome"
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

    startTransition(async () => {
      const nextPinned = !pinnedAt
      const result = await setGalleryImagePin(imageId, nextPinned)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPinnedAt(result.data.pinned_at)
      onPinnedChange?.(result.data.pinned_at)
      toast.success(nextPinned ? "Pinned to wall top." : "Unpinned.")
      if (nextPinned && navigateHomeOnPin) {
        router.push("/")
        return
      }
      if (nextPinned && scrollToWallTop) {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={cn(
        galleryPillClass(),
        pinnedAt && "text-amber-700 dark:text-amber-300",
        className
      )}
    >
      {pinnedAt ? "Unpin" : "Pin"}
    </button>
  )
}
