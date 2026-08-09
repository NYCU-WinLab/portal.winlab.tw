import { describe, expect, test } from "bun:test"

import {
  clampSlideshowIntervalMs,
  GALLERY_SLIDESHOW_DEFAULT_MS,
  nextSlideshowIndex,
  prevSlideshowIndex,
} from "@/lib/gallery/slideshow"

describe("clampSlideshowIntervalMs", () => {
  test("defaults non-finite", () => {
    expect(clampSlideshowIntervalMs(Number.NaN)).toBe(
      GALLERY_SLIDESHOW_DEFAULT_MS
    )
  })

  test("clamps extremes", () => {
    expect(clampSlideshowIntervalMs(100)).toBe(1500)
    expect(clampSlideshowIntervalMs(60_000)).toBe(15_000)
  })
})

describe("slideshow index wrap", () => {
  test("next wraps", () => {
    expect(nextSlideshowIndex(0, 3)).toBe(1)
    expect(nextSlideshowIndex(2, 3)).toBe(0)
  })

  test("prev wraps", () => {
    expect(prevSlideshowIndex(0, 3)).toBe(2)
    expect(prevSlideshowIndex(1, 3)).toBe(0)
  })

  test("empty stays zero", () => {
    expect(nextSlideshowIndex(5, 0)).toBe(0)
    expect(prevSlideshowIndex(5, 0)).toBe(0)
  })
})
