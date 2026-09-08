import { cn } from "@workspace/ui/lib/utils"

import type { GallerySequenceItem } from "@/lib/gallery/types"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

export function mediaUrlFromItem(item: GallerySequenceItem): string {
  return getGalleryImageUrl(item.image_path)
}

export function thumbUrlFromItem(item: GallerySequenceItem): string {
  if (item.media_type === "video" && item.poster_path) {
    return getGalleryThumbUrl(item.poster_path)
  }
  return getGalleryThumbUrl(item.image_path)
}

export function posterUrlFromItem(item: GallerySequenceItem): string | null {
  return item.poster_path ? getGalleryImageUrl(item.poster_path) : null
}

export function PlayBadge() {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        "bg-gradient-to-t from-black/30 via-transparent to-transparent"
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  )
}
