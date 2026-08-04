"use client"

import { IconArrowsShuffle } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { GalleryKeyboardCheatsheet } from "@/app/_components/gallery-keyboard-cheatsheet"
import { gallerySans } from "@/components/gallery-chrome"

export function GalleryWallToolbar({
  canShuffle,
  onShuffle,
  lightboxOpen = false,
}: {
  canShuffle: boolean
  onShuffle: () => void
  lightboxOpen?: boolean
}) {
  return (
    <div
      className={cn(
        gallerySans(),
        "mb-6 flex items-center justify-end gap-2 sm:mb-7"
      )}
    >
      <button
        type="button"
        disabled={!canShuffle}
        onClick={onShuffle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] tracking-wide uppercase shadow-sm backdrop-blur-sm transition-colors",
          "hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-40",
          "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        )}
      >
        <IconArrowsShuffle className="size-3.5" aria-hidden />
        Shuffle wall
      </button>
      <GalleryKeyboardCheatsheet lightboxOpen={lightboxOpen} />
    </div>
  )
}
