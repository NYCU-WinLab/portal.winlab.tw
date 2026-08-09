"use client"

import { IconArrowsShuffle, IconList } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { GalleryKeyboardCheatsheet } from "@/app/_components/gallery-keyboard-cheatsheet"
import { gallerySans } from "@/components/gallery-chrome"

export function GalleryWallToolbar({
  canShuffle,
  shuffled = false,
  onShuffle,
  onRestoreOrder,
  lightboxOpen = false,
}: {
  canShuffle: boolean
  shuffled?: boolean
  onShuffle: () => void
  onRestoreOrder?: () => void
  lightboxOpen?: boolean
}) {
  return (
    <div
      className={cn(
        gallerySans(),
        "mb-6 flex flex-wrap items-center justify-end gap-2 sm:mb-7"
      )}
    >
      {shuffled && onRestoreOrder ? (
        <button
          type="button"
          disabled={lightboxOpen}
          onClick={onRestoreOrder}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] tracking-wide uppercase shadow-sm backdrop-blur-sm transition-colors",
            "hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          )}
        >
          <IconList className="size-3.5" aria-hidden />
          Restore order
        </button>
      ) : null}
      <button
        type="button"
        disabled={!canShuffle}
        onClick={onShuffle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] tracking-wide uppercase shadow-sm backdrop-blur-sm transition-colors",
          "hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
          shuffled && "border-foreground/25 bg-foreground/[0.06]",
          "disabled:pointer-events-none disabled:opacity-40",
          "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        )}
      >
        <IconArrowsShuffle className="size-3.5" aria-hidden />
        {shuffled ? "Shuffle again" : "Shuffle wall"}
      </button>
      <GalleryKeyboardCheatsheet lightboxOpen={lightboxOpen} />
    </div>
  )
}
