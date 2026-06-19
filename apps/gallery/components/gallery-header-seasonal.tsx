import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { DRAGON_BOAT_FLEET } from "@/lib/gallery/seasonal-stickers"

export function GalleryHeaderSeasonal() {
  return (
    <div
      className={cn(
        gallerySans(),
        "gallery-header-seasonal pointer-events-none"
      )}
      aria-hidden
    >
      <div className="gallery-header-fleet flex items-end gap-0.5 sm:gap-1">
        {DRAGON_BOAT_FLEET.map((glyph, i) => (
          <span
            key={`${glyph}-${i}`}
            className={cn(
              "leading-none drop-shadow-sm select-none",
              i === 2 ? "text-lg sm:text-xl" : "text-sm opacity-90 sm:text-base"
            )}
          >
            {glyph}
          </span>
        ))}
      </div>
    </div>
  )
}
