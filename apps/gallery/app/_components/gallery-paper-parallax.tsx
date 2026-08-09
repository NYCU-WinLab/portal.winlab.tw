"use client"

import { useEffect } from "react"

/** Soft paper-wall parallax — nudges backdrop grain on scroll (reduced-motion safe). */
export function GalleryPaperParallax() {
  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduced.matches) return

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = Math.min(window.scrollY, 480)
        root.style.setProperty("--gallery-parallax-y", `${y * 0.04}px`)
      })
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      root.style.removeProperty("--gallery-parallax-y")
    }
  }, [])

  return null
}
