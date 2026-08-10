import { describe, expect, test } from "bun:test"

import {
  albumMatchesQuery,
  GALLERY_ALBUM_DESCRIPTION_MAX,
  GALLERY_ALBUM_PHOTOS_MAX,
  isGalleryAlbumsUnavailable,
  nextAlbumCoverAfterRemove,
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

  test("rejects overlong descriptions", () => {
    expect(
      normalizeGalleryAlbumDescription(
        "x".repeat(GALLERY_ALBUM_DESCRIPTION_MAX + 1)
      )
    ).toBeNull()
    expect(
      normalizeGalleryAlbumDescription(
        "x".repeat(GALLERY_ALBUM_DESCRIPTION_MAX)
      )
    ).toBe("x".repeat(GALLERY_ALBUM_DESCRIPTION_MAX))
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
    expect(
      isGalleryAlbumsUnavailable({
        message: "Could not find the function gallery_list_albums",
      })
    ).toBe(true)
    expect(isGalleryAlbumsUnavailable({ message: "permission denied" })).toBe(
      false
    )
  })
})

describe("nextAlbumCoverAfterRemove", () => {
  test("keeps cover when it was not removed", () => {
    expect(nextAlbumCoverAfterRemove("a", ["a", "b"], ["b"])).toBe("a")
  })

  test("advances to the next remaining photo", () => {
    expect(nextAlbumCoverAfterRemove("a", ["b", "c"], ["a"])).toBe("b")
  })

  test("clears cover when nothing remains", () => {
    expect(nextAlbumCoverAfterRemove("a", [], ["a"])).toBe(null)
  })

  test("clears cover when the only photo was removed", () => {
    expect(nextAlbumCoverAfterRemove("solo", [], ["solo"])).toBe(null)
  })

  test("keeps cover when remaining list omits it but it was not removed", () => {
    expect(nextAlbumCoverAfterRemove("a", ["b"], [])).toBe("a")
  })

  test("treats nullish cover as cleared", () => {
    expect(nextAlbumCoverAfterRemove(null, ["a"], ["a"])).toBe(null)
    expect(nextAlbumCoverAfterRemove(undefined, ["a"], [])).toBe(null)
  })
})

describe("albumMatchesQuery", () => {
  const album = {
    title: "Lab Retreat",
    slug: "lab-retreat",
    description: "Photos from Nantou",
    owner_name: "Alice",
  }

  test("blank query matches everything", () => {
    expect(albumMatchesQuery(album, "   ")).toBe(true)
  })

  test("matches title, slug, description, and owner case-insensitively", () => {
    expect(albumMatchesQuery(album, "retreat")).toBe(true)
    expect(albumMatchesQuery(album, "LAB-")).toBe(true)
    expect(albumMatchesQuery(album, "nantou")).toBe(true)
    expect(albumMatchesQuery(album, "alice")).toBe(true)
  })

  test("rejects non-matches", () => {
    expect(albumMatchesQuery(album, "world-cup")).toBe(false)
  })

  test("matches owner name only", () => {
    expect(albumMatchesQuery(album, "Alice")).toBe(true)
    expect(
      albumMatchesQuery(
        {
          title: "Quiet",
          slug: "quiet",
          description: null,
          owner_name: "Benedict",
        },
        "benedict"
      )
    ).toBe(true)
  })

  test("matches unicode title text", () => {
    expect(
      albumMatchesQuery(
        {
          title: "實驗室出遊",
          slug: "lab-trip",
          description: null,
          owner_name: "小明",
        },
        "實驗"
      )
    ).toBe(true)
    expect(
      albumMatchesQuery(
        {
          title: "實驗室出遊",
          slug: "lab-trip",
          description: null,
          owner_name: "小明",
        },
        "小明"
      )
    ).toBe(true)
  })
})
