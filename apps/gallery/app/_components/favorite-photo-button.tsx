"use client"

import { useState, useTransition } from "react"
import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { toggleGalleryFavorite } from "@/app/actions/favorites"
import { gallerySans } from "@/components/gallery-chrome"

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
      toast.success(
        result.favorited ? "Saved to favorites" : "Removed from favorites"
      )
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-busy={pending}
      aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
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
      {favorited ? "Saved" : "Save"}
    </button>
  )
}
