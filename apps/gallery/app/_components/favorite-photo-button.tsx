"use client"

import { useState, useTransition, useEffect } from "react"
import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { toggleGalleryFavorite } from "@/app/actions/favorites"
import { gallerySans } from "@/components/gallery-chrome"
import {
  describeFavoriteAriaLabel,
  describeFavoriteButtonLabel,
  describeFavoriteToast,
} from "@/lib/gallery/favorite-toast"

type FavoritePhotoButtonProps = {
  imageId: string
  initialFavorited?: boolean
  className?: string
  onChanged?: (favorited: boolean) => void
}

export function FavoritePhotoButton({
  imageId,
  initialFavorited = false,
  className,
  onChanged,
}: FavoritePhotoButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setFavorited(initialFavorited)
  }, [imageId, initialFavorited])

  const toggle = () => {
    if (pending) return
    const next = !favorited
    setFavorited(next)
    startTransition(async () => {
      const result = await toggleGalleryFavorite(imageId, next)
      if (!result.ok) {
        setFavorited(!next)
        toast.error(result.error)
        return
      }
      onChanged?.(result.favorited)
      toast.success(describeFavoriteToast(result.favorited))
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-busy={pending || undefined}
      aria-label={describeFavoriteAriaLabel(favorited)}
      className={cn(
        gallerySans(),
        "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
        "hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        favorited && "border-foreground/20 bg-foreground/[0.04]",
        className
      )}
    >
      {favorited ? (
        <IconBookmarkFilled className="size-3.5" aria-hidden />
      ) : (
        <IconBookmark className="size-3.5" aria-hidden />
      )}
      {describeFavoriteButtonLabel(favorited)}
    </button>
  )
}
