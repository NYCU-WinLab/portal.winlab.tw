import { describe, expect, test } from "bun:test"

import {
  getMemoriesOverlayState,
  setMemoriesOverlayState,
} from "@/lib/gallery/memories-overlay-store"

describe("memories overlay store", () => {
  test("updates lightbox and slideshow flags", () => {
    setMemoriesOverlayState({ lightboxOpen: false, slideshowOpen: false })
    expect(getMemoriesOverlayState()).toEqual({
      lightboxOpen: false,
      slideshowOpen: false,
    })
    setMemoriesOverlayState({ lightboxOpen: true })
    expect(getMemoriesOverlayState().lightboxOpen).toBe(true)
    setMemoriesOverlayState({ slideshowOpen: true, lightboxOpen: false })
    expect(getMemoriesOverlayState()).toEqual({
      lightboxOpen: false,
      slideshowOpen: true,
    })
    setMemoriesOverlayState({ lightboxOpen: false, slideshowOpen: false })
  })

  test("cleanup-style reset clears both flags", () => {
    setMemoriesOverlayState({ lightboxOpen: true, slideshowOpen: true })
    setMemoriesOverlayState({ lightboxOpen: false, slideshowOpen: false })
    expect(getMemoriesOverlayState()).toEqual({
      lightboxOpen: false,
      slideshowOpen: false,
    })
  })
})
