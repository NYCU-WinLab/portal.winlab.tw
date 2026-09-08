import { describe, expect, test } from "bun:test"

import { shouldShowJumpToTop } from "@/lib/gallery/scroll-visibility"

describe("shouldShowJumpToTop", () => {
  test("hidden near the top", () => {
    expect(shouldShowJumpToTop(0, 900)).toBe(false)
    expect(shouldShowJumpToTop(200, 900)).toBe(false)
  })

  test("shown once well past the first screen", () => {
    expect(shouldShowJumpToTop(1400, 900)).toBe(true)
  })

  test("enforces a floor for very short viewports", () => {
    // 1.5 * 300 = 450, but the floor keeps it hidden until 600px.
    expect(shouldShowJumpToTop(500, 300)).toBe(false)
    expect(shouldShowJumpToTop(700, 300)).toBe(true)
  })

  test("guards against non-finite input", () => {
    expect(shouldShowJumpToTop(Number.NaN, 900)).toBe(false)
    expect(shouldShowJumpToTop(1400, Number.NaN)).toBe(false)
  })
})
