import { describe, expect, test } from "bun:test"

import {
  describeBulkFavoriteResult,
  GALLERY_FAVORITES_BULK_MAX,
  normalizeGalleryFavoriteImageIds,
} from "@/lib/gallery/favorites-bulk"

describe("normalizeGalleryFavoriteImageIds", () => {
  test("trims, dedupes, preserves order", () => {
    expect(
      normalizeGalleryFavoriteImageIds([" a ", "b", "a", "", "c"])
    ).toEqual(["a", "b", "c"])
  })

  test("caps at bulk max", () => {
    const ids = Array.from(
      { length: GALLERY_FAVORITES_BULK_MAX + 10 },
      (_, i) => String(i)
    )
    expect(normalizeGalleryFavoriteImageIds(ids)).toHaveLength(
      GALLERY_FAVORITES_BULK_MAX
    )
  })
})

describe("describeBulkFavoriteResult", () => {
  test("formats save / remove / empty", () => {
    expect(describeBulkFavoriteResult(true, 0)).toBe(
      "Already saved — nothing new"
    )
    expect(describeBulkFavoriteResult(false, 0)).toBe(
      "None of those were saved"
    )
    expect(describeBulkFavoriteResult(true, 1)).toBe(
      "Saved 1 photo to favorites"
    )
    expect(describeBulkFavoriteResult(true, 3)).toBe(
      "Saved 3 photos to favorites"
    )
    expect(describeBulkFavoriteResult(false, 1)).toBe(
      "Removed 1 photo from favorites"
    )
    expect(describeBulkFavoriteResult(false, 2)).toBe(
      "Removed 2 photos from favorites"
    )
  })
})
