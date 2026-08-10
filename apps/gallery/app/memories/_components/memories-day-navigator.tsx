"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import {
  isMemoriesViewingToday,
  memoriesDayHref,
  shiftGalleryCalendarDay,
  type GalleryCalendarDay,
} from "@/lib/gallery/memories"
import {
  describeChooseCalendarDayAriaLabel,
  describeNextDayAriaLabel,
  describePreviousDayAriaLabel,
} from "@/lib/gallery/keyboard-memories-labels"

/** Prev / next / today controls for the Memories calendar day. */
export function MemoriesDayNavigator({ day }: { day: GalleryCalendarDay }) {
  const router = useRouter()
  const prev = shiftGalleryCalendarDay(day.month, day.day, -1)
  const next = shiftGalleryCalendarDay(day.month, day.day, 1)
  const viewingToday = isMemoriesViewingToday(day)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return
      if (isTypingTarget(event.target)) return
      if (
        document.querySelector(
          '[data-slot="dialog-content"][data-state="open"]'
        )
      ) {
        return
      }

      const key = event.key
      if (key === "ArrowLeft" || key === "k" || key === "K") {
        event.preventDefault()
        router.push(memoriesDayHref(prev.month, prev.day))
        return
      }
      if (key === "ArrowRight" || key === "j" || key === "J") {
        event.preventDefault()
        router.push(memoriesDayHref(next.month, next.day))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [next.day, next.month, prev.day, prev.month, router])

  return (
    <nav
      aria-label={describeChooseCalendarDayAriaLabel()}
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
        aria-label={describePreviousDayAriaLabel()}
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
        aria-label={describeNextDayAriaLabel()}
      >
        <span className="hidden sm:inline">Next</span>
        <IconChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  )
}
