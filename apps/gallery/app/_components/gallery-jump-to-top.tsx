"use client"

import { useEffect, useState } from "react"

import { IconArrowUp } from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { describeBackToTopAriaLabel } from "@/lib/gallery/busy-labels"
import { shouldShowJumpToTop } from "@/lib/gallery/scroll-visibility"

/**
 * Floating "back to the top of the wall" affordance. The infinite wall can run
 * for hundreds of polaroids; without this the only way home is a long flick.
 * Sits under the lightbox (z-100) and cheat sheet (z-95) so it never fights
 * them, and honours reduced-motion by jumping instead of smooth-scrolling.
 */
export function GalleryJumpToTop() {
  const [visible, setVisible] = useState(false)
  const [scrolling, setScrolling] = useState(false)

  useEffect(() => {
    let frame = 0
    const evaluate = () => {
      frame = 0
      setVisible(shouldShowJumpToTop(window.scrollY, window.innerHeight))
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(evaluate)
    }

    evaluate()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  const jump = () => {
    if (scrolling) return
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    setScrolling(true)
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
    // Put keyboard users back at the page landmark after the scroll.
    queueMicrotask(() => {
      document.getElementById("gallery-main")?.focus({ preventScroll: true })
    })
    window.setTimeout(() => setScrolling(false), reduceMotion ? 0 : 600)
  }

  return (
    <button
      type="button"
      onClick={jump}
      disabled={scrolling}
      aria-busy={scrolling || undefined}
      aria-label={describeBackToTopAriaLabel()}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        gallerySans(),
        "fixed right-4 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-[55]",
        "inline-flex size-11 items-center justify-center rounded-full",
        "border border-zinc-900/12 bg-[#f7f7f5]/95 text-foreground",
        "shadow-[0_2px_6px_rgba(24,24,27,0.12),0_14px_32px_-16px_rgba(24,24,27,0.5)]",
        "backdrop-blur-sm transition-[opacity,transform] duration-300 ease-out",
        "hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:opacity-70",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      )}
    >
      <IconArrowUp className="size-5" aria-hidden />
    </button>
  )
}
