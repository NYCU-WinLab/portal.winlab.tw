import { describe, expect, test } from "bun:test"

import { isGalleryFavoritesUnavailable } from "@/lib/gallery/favorites"

describe("isGalleryFavoritesUnavailable", () => {
  test("detects missing relation / RPC / schema cache", () => {
    expect(isGalleryFavoritesUnavailable(null)).toBe(false)
    expect(
      isGalleryFavoritesUnavailable({
        code: "PGRST205",
        message: "Could not find the table",
      })
    ).toBe(true)
    expect(
      isGalleryFavoritesUnavailable({
        message:
          "function gallery_wall_cover_ids_for_favorites() does not exist",
      })
    ).toBe(true)
    expect(
      isGalleryFavoritesUnavailable({
        message:
          "Could not find the table 'public.gallery_favorites' in the schema cache",
      })
    ).toBe(true)
    expect(
      isGalleryFavoritesUnavailable({
        message: "permission denied for table gallery_favorites",
      })
    ).toBe(false)
  })
})
