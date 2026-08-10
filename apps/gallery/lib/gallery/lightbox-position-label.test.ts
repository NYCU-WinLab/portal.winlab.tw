import { describe, expect, test } from "bun:test"

import { describeAlbumLightboxPositionLabel } from "@/lib/gallery/lightbox-position-label"

describe("describeAlbumLightboxPositionLabel", () => {
  test("omits position for a single photo", () => {
    expect(describeAlbumLightboxPositionLabel("Lab", 0, 1)).toBe("Lab")
  })

  test("includes 1-based position in a multi list", () => {
    expect(describeAlbumLightboxPositionLabel("Lab", 1, 4)).toBe("Lab · 2 of 4")
  })

  test("falls back when the name is blank", () => {
    expect(describeAlbumLightboxPositionLabel("  ", 0, 2)).toBe(
      "Untitled · 1 of 2"
    )
  })
})
