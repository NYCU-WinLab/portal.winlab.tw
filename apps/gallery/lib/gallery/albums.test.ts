import { describe, expect, test } from "bun:test"

import {
  GALLERY_ALBUM_PHOTOS_MAX,
  isGalleryAlbumsUnavailable,
  normalizeAlbumPositions,
  normalizeGalleryAlbumDescription,
  normalizeGalleryAlbumImageIds,
  normalizeGalleryAlbumSlug,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"

describe("normalizeGalleryAlbumSlug", () => {
  test("slugifies titles", () => {
    expect(normalizeGalleryAlbumSlug("Lab Retreat 2026")).toBe(
      "lab-retreat-2026"
    )
    expect(normalizeGalleryAlbumSlug("  Hello__World!! ")).toBe("hello-world")
  })

  test("rejects empty or punctuation-only input", () => {
    expect(normalizeGalleryAlbumSlug("")).toBeNull()
    expect(normalizeGalleryAlbumSlug("!!!")).toBeNull()
    expect(normalizeGalleryAlbumSlug("---")).toBeNull()
  })
})

describe("normalizeGalleryAlbumTitle", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeGalleryAlbumTitle("  Lab   Trip ")).toBe("Lab Trip")
  })

  test("rejects titles that cannot slugify", () => {
    expect(normalizeGalleryAlbumTitle("!!!")).toBeNull()
    expect(normalizeGalleryAlbumTitle("")).toBeNull()
  })
})

describe("normalizeGalleryAlbumDescription", () => {
  test("returns null for blank", () => {
    expect(normalizeGalleryAlbumDescription("   ")).toBeNull()
    expect(normalizeGalleryAlbumDescription(null)).toBeNull()
  })

  test("trims description", () => {
    expect(normalizeGalleryAlbumDescription("  Photos from the trip. ")).toBe(
      "Photos from the trip."
    )
  })
})

describe("normalizeAlbumPositions", () => {
  test("dedupes and assigns contiguous positions", () => {
    expect(normalizeAlbumPositions(["a", "b", "a", "  ", "c"])).toEqual([
      { image_id: "a", position: 0 },
      { image_id: "b", position: 1 },
      { image_id: "c", position: 2 },
    ])
  })

  test("caps at album photo max", () => {
    const ids = Array.from({ length: GALLERY_ALBUM_PHOTOS_MAX + 5 }, (_, i) =>
      String(i)
    )
    expect(normalizeAlbumPositions(ids)).toHaveLength(GALLERY_ALBUM_PHOTOS_MAX)
  })
})

describe("normalizeGalleryAlbumImageIds", () => {
  test("trims, dedupes, and preserves order", () => {
    expect(
      normalizeGalleryAlbumImageIds([" a ", "b", "a", "", "c", "b"])
    ).toEqual(["a", "b", "c"])
  })
})

describe("isGalleryAlbumsUnavailable", () => {
  test("detects missing album RPCs", () => {
    expect(
      isGalleryAlbumsUnavailable({
        message: "Could not find the function gallery_album_add_images",
      })
    ).toBe(true)
    expect(
      isGalleryAlbumsUnavailable({
        message: "Could not find the function gallery_wall_cover_ids_for_album",
      })
    ).toBe(true)
    expect(
      isGalleryAlbumsUnavailable({
        message: "Could not find the function gallery_album_reorder_images",
      })
    ).toBe(true)
    expect(isGalleryAlbumsUnavailable({ message: "permission denied" })).toBe(
      false
    )
  })
})
