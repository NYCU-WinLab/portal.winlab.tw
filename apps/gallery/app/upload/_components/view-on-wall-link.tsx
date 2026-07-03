import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { galleryPillClass } from "@/components/gallery-chrome"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"

export function ViewOnWallLink({
  photoId,
  className,
}: {
  photoId: string
  className?: string
}) {
  return (
    <Link
      href={buildGalleryPhotoHref({ photoId })}
      className={cn(galleryPillClass(), className)}
    >
      On wall
    </Link>
  )
}
