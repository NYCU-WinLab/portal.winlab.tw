import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { galleryPillClass } from "@/components/gallery-chrome"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"

export function ViewOnWallLink({
  photoId,
  name,
  className,
}: {
  photoId: string
  name?: string
  className?: string
}) {
  return (
    <Link
      href={buildGalleryPhotoHref({ photoId })}
      aria-label={name ? `View ${name} on the wall` : "View on the wall"}
      className={cn(galleryPillClass(), className)}
    >
      On wall
    </Link>
  )
}
