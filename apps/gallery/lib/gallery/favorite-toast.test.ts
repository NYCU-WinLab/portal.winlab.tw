import { describe, expect, test } from "bun:test"

import { describeFavoriteToast } from "@/lib/gallery/favorite-toast"

describe("describeFavoriteToast", () => {
  test("saved", () => {
    expect(describeFavoriteToast(true)).toBe("Saved to favorites")
  })

  test("removed", () => {
    expect(describeFavoriteToast(false)).toBe("Removed from favorites")
  })
})
