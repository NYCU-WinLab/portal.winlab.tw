import { describe, expect, test } from "bun:test"

import {
  describeFavoriteAriaLabel,
  describeFavoriteToast,
} from "@/lib/gallery/favorite-toast"

describe("describeFavoriteToast", () => {
  test("saved", () => {
    expect(describeFavoriteToast(true)).toBe("Saved to favorites")
  })

  test("removed", () => {
    expect(describeFavoriteToast(false)).toBe("Removed from favorites")
  })
})

describe("describeFavoriteAriaLabel", () => {
  test("toggles with favorited state", () => {
    expect(describeFavoriteAriaLabel(true)).toBe("Remove from favorites")
    expect(describeFavoriteAriaLabel(false)).toBe("Save to favorites")
  })
})
