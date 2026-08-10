import { describe, expect, test } from "bun:test"

import { describeAlbumLightboxPositionLabel } from "@/lib/gallery/lightbox-position-label"

describe("describeAlbumLightboxPositionLabel", () => {
  test("omits position for a single photo", () => {
    expect(describeAlbumLightboxPositionLabel("Lab", 0, 1)).toBe("Lab")
  })

  test("includes middle position without edge words", () => {
    expect(describeAlbumLightboxPositionLabel("Lab", 1, 4)).toBe("Lab · 2 of 4")
  })

  test("marks first and last edges", () => {
    expect(describeAlbumLightboxPositionLabel("Lab", 0, 4)).toBe(
      "Lab · 1 of 4 · first"
    )
    expect(describeAlbumLightboxPositionLabel("Lab", 3, 4)).toBe(
      "Lab · 4 of 4 · last"
    )
  })

  test("falls back for blank names", () => {
    expect(describeAlbumLightboxPositionLabel("  ", 0, 2)).toBe(
      "Untitled · 1 of 2 · first"
    )
  })
})
