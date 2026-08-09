"use client"

import Link from "next/link"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import {
  isMemoriesViewingToday,
  memoriesDayHref,
  shiftGalleryCalendarDay,
  type GalleryCalendarDay,
} from "@/lib/gallery/memories"

/** Prev / next / today controls for the Memories calendar day. */
export function MemoriesDayNavigator({ day }: { day: GalleryCalendarDay }) {
  const prev = shiftGalleryCalendarDay(day.month, day.day, -1)
  const next = shiftGalleryCalendarDay(day.month, day.day, 1)
  const viewingToday = isMemoriesViewingToday(day)

  return (
    <nav
      aria-label="Choose a calendar day"
      className={cn(
        gallerySans(),
        "flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      )}
    >
      <Link
        href={memoriesDayHref(prev.month, prev.day)}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2.5",
          "hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-zinc-900/25 focus-visible:outline-none"
        )}
        aria-label="Previous day"
      >
        <IconChevronLeft className="size-4" aria-hidden />
        <span className="hidden sm:inline">Previous</span>
      </Link>

      {viewingToday ? (
        <span
          className="inline-flex h-9 items-center rounded-md px-2.5 text-xs tracking-[0.14em] text-muted-foreground uppercase"
          aria-current="date"
        >
          Today
        </span>
      ) : (
        <Link
          href="/memories"
          className={cn(
            "inline-flex h-9 items-center rounded-md border border-border/60 bg-background/70 px-2.5 text-xs tracking-[0.14em] uppercase",
            "hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-zinc-900/25 focus-visible:outline-none"
          )}
        >
          Today
        </Link>
      )}

      <Link
        href={memoriesDayHref(next.month, next.day)}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2.5",
          "hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-zinc-900/25 focus-visible:outline-none"
        )}
        aria-label="Next day"
      >
        <span className="hidden sm:inline">Next</span>
        <IconChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  )
}
