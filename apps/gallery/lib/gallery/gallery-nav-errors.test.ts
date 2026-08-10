import { describe, expect, test } from "bun:test"

import {
  describeGalleryNavError,
  galleryNavErrors,
} from "@/lib/gallery/gallery-nav-errors"

describe("describeGalleryNavError", () => {
  test("returns known soft-fail copy", () => {
    expect(describeGalleryNavError("closePhoto")).toBe(
      galleryNavErrors.closePhoto
    )
    expect(describeGalleryNavError("openMentionedPhoto")).toBe(
      "Could not open the mentioned photo."
    )
  })
})
