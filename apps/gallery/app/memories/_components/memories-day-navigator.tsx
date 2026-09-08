"use client"

import { useCallback, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { GalleryKeyboardCheatsheet } from "@/app/_components/gallery-keyboard-cheatsheet"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { useMemoriesOverlayState } from "@/lib/gallery/memories-overlay-store"
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
import { describeMemoriesTodayShortcutHint } from "@/lib/gallery/memories-today-hint"

/** Prev / next / today controls for the Memories calendar day. */
export function MemoriesDayNavigator({ day }: { day: GalleryCalendarDay }) {
  const router = useRouter()
  const prev = shiftGalleryCalendarDay(day.month, day.day, -1)
  const next = shiftGalleryCalendarDay(day.month, day.day, 1)
  const viewingToday = isMemoriesViewingToday(day)
  const { lightboxOpen, slideshowOpen } = useMemoriesOverlayState()

  // softPush is memoized on router so the keydown effect stays stable.
  const softPush = useCallback(
    (
      href: string,
      errorKey: "memoriesPreviousDay" | "memoriesNextDay" | "memoriesToday"
    ) => {
      try {
        router.push(href)
      } catch {
        toast.error(describeGalleryNavError(errorKey))
      }
    },
    [router]
  )

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
        softPush(memoriesDayHref(prev.month, prev.day), "memoriesPreviousDay")
        return
      }
      if (key === "ArrowRight" || key === "j" || key === "J") {
        event.preventDefault()
        softPush(memoriesDayHref(next.month, next.day), "memoriesNextDay")
        return
      }
      if (key === "t" || key === "T") {
        if (viewingToday) return
        event.preventDefault()
        softPush("/memories", "memoriesToday")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [next.day, next.month, prev.day, prev.month, softPush, viewingToday])

  const todayHint = describeMemoriesTodayShortcutHint(viewingToday)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
        <GalleryKeyboardCheatsheet
          memories
          lightboxOpen={lightboxOpen}
          slideshowOpen={slideshowOpen}
        />
      </div>
      {todayHint ? (
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          {todayHint}
        </p>
      ) : null}
    </div>
  )
}
