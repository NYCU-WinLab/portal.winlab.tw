import { describe, expect, test } from "bun:test"

import {
  DRAGON_BOAT_FLEET,
  WORLD_CUP_HEADER_GLYPHS,
} from "@/lib/gallery/seasonal-stickers"

describe("seasonal sticker constants", () => {
  test("dragon boat fleet is a short non-empty glyph row", () => {
    expect(DRAGON_BOAT_FLEET.length).toBeGreaterThanOrEqual(3)
    expect(DRAGON_BOAT_FLEET).toContain("🐲")
    expect(DRAGON_BOAT_FLEET).toContain("🛶")
  })

  test("world cup header glyphs include ball and goal", () => {
    expect(WORLD_CUP_HEADER_GLYPHS.length).toBeGreaterThanOrEqual(3)
    expect(WORLD_CUP_HEADER_GLYPHS).toContain("⚽")
    expect(WORLD_CUP_HEADER_GLYPHS).toContain("🥅")
  })
})
