import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import {
  DRAGON_BOAT_FLEET,
  WORLD_CUP_HEADER_GLYPHS,
} from "@/lib/gallery/seasonal-stickers"
import type { GallerySeasonalThemeId } from "@/lib/gallery/seasonal-themes"

function SeasonalGlyphFleet({
  glyphs,
  className,
}: {
  glyphs: readonly string[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "gallery-header-fleet flex items-end gap-0.5 sm:gap-1",
        className
      )}
    >
      {glyphs.map((glyph, i) => (
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
  )
}

export function GalleryHeaderSeasonal({
  themeId,
}: {
  themeId: GallerySeasonalThemeId | null
}) {
  if (!themeId) return null

  return (
    <div
      className={cn(
        gallerySans(),
        "gallery-header-seasonal pointer-events-none",
        themeId === "world-cup" && "gallery-header-seasonal--world-cup"
      )}
      aria-hidden
    >
      {themeId === "dragon-boat" ? (
        <SeasonalGlyphFleet glyphs={DRAGON_BOAT_FLEET} />
      ) : (
        <SeasonalGlyphFleet
          glyphs={WORLD_CUP_HEADER_GLYPHS}
          className="gallery-header-fleet--world-cup"
        />
      )}
    </div>
  )
}
