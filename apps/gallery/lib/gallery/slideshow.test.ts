import { describe, expect, test } from "bun:test"

import {
  clampSlideshowIntervalMs,
  clampSlideshowStartIndex,
  findSlideshowIndexByImageId,
  flattenMemoryGroupsForSlideshow,
  GALLERY_SLIDESHOW_DEFAULT_MS,
  GALLERY_SLIDESHOW_INTERVAL_STORAGE_KEY,
  nextSlideshowIndex,
  prevSlideshowIndex,
  readStoredSlideshowIntervalMs,
  slideshowIndexFromDigitKey,
  slideshowIndexFromProgress,
  expandWallSelectionSlideshowPhotos,
  wallSelectionToSlideshowPhotos,
  writeStoredSlideshowIntervalMs,
  shuffleSlideshowPhotos,
} from "@/lib/gallery/slideshow"

describe("clampSlideshowIntervalMs", () => {
  test("defaults non-finite", () => {
    expect(clampSlideshowIntervalMs(Number.NaN)).toBe(
      GALLERY_SLIDESHOW_DEFAULT_MS
    )
  })

  test("clamps extremes", () => {
    expect(clampSlideshowIntervalMs(100)).toBe(1500)
    expect(clampSlideshowIntervalMs(60_000)).toBe(15_000)
  })
})

describe("stored slideshow interval", () => {
  test("reads and writes through a fake store", () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }

    expect(readStoredSlideshowIntervalMs(storage)).toBe(
      GALLERY_SLIDESHOW_DEFAULT_MS
    )
    expect(writeStoredSlideshowIntervalMs(2500, storage)).toBe(2500)
    expect(store.get(GALLERY_SLIDESHOW_INTERVAL_STORAGE_KEY)).toBe("2500")
    expect(readStoredSlideshowIntervalMs(storage)).toBe(2500)
    expect(writeStoredSlideshowIntervalMs(50, storage)).toBe(1500)
  })

  test("tolerates null storage", () => {
    expect(readStoredSlideshowIntervalMs(null)).toBe(
      GALLERY_SLIDESHOW_DEFAULT_MS
    )
    expect(writeStoredSlideshowIntervalMs(3000, null)).toBe(3000)
  })
})

describe("slideshow index wrap", () => {
  test("next wraps", () => {
    expect(nextSlideshowIndex(0, 3)).toBe(1)
    expect(nextSlideshowIndex(2, 3)).toBe(0)
  })

  test("prev wraps", () => {
    expect(prevSlideshowIndex(0, 3)).toBe(2)
    expect(prevSlideshowIndex(1, 3)).toBe(0)
  })

  test("empty stays zero", () => {
    expect(nextSlideshowIndex(5, 0)).toBe(0)
    expect(prevSlideshowIndex(5, 0)).toBe(0)
  })
})

describe("clampSlideshowStartIndex", () => {
  test("clamps into range", () => {
    expect(clampSlideshowStartIndex(-1, 4)).toBe(0)
    expect(clampSlideshowStartIndex(99, 4)).toBe(3)
    expect(clampSlideshowStartIndex(2.9, 4)).toBe(2)
  })

  test("empty list stays zero", () => {
    expect(clampSlideshowStartIndex(5, 0)).toBe(0)
  })
})

describe("slideshowIndexFromProgress", () => {
  test("maps ratio across the deck", () => {
    expect(slideshowIndexFromProgress(0, 4)).toBe(0)
    expect(slideshowIndexFromProgress(0.24, 4)).toBe(0)
    expect(slideshowIndexFromProgress(0.25, 4)).toBe(1)
    expect(slideshowIndexFromProgress(0.99, 4)).toBe(3)
    expect(slideshowIndexFromProgress(1, 4)).toBe(3)
  })

  test("guards empty and non-finite", () => {
    expect(slideshowIndexFromProgress(0.5, 0)).toBe(0)
    expect(slideshowIndexFromProgress(Number.NaN, 3)).toBe(0)
  })
})

describe("slideshowIndexFromDigitKey", () => {
  test("maps 1–9 and 0", () => {
    expect(slideshowIndexFromDigitKey("1", 10)).toBe(1)
    expect(slideshowIndexFromDigitKey("5", 10)).toBe(5)
    expect(slideshowIndexFromDigitKey("0", 10)).toBe(9)
    expect(slideshowIndexFromDigitKey("a", 10)).toBeNull()
  })
})

describe("findSlideshowIndexByImageId", () => {
  test("returns matching index or zero", () => {
    const photos = [{ image_id: "a" }, { image_id: "b" }]
    expect(findSlideshowIndexByImageId(photos, "b")).toBe(1)
    expect(findSlideshowIndexByImageId(photos, "missing")).toBe(0)
  })
})

describe("flattenMemoryGroupsForSlideshow", () => {
  test("preserves year-group order and maps ids", () => {
    expect(
      flattenMemoryGroupsForSlideshow([
        {
          photos: [
            {
              id: "a",
              name: "A",
              image_path: "u/a.jpg",
              media_type: "image",
              poster_path: null,
            },
          ],
        },
        {
          photos: [
            {
              id: "b",
              name: "B",
              image_path: "u/b.jpg",
              media_type: "video",
              poster_path: "u/b-p.jpg",
            },
          ],
        },
      ])
    ).toEqual([
      {
        image_id: "a",
        name: "A",
        image_path: "u/a.jpg",
        media_type: "image",
        poster_path: null,
      },
      {
        image_id: "b",
        name: "B",
        image_path: "u/b.jpg",
        media_type: "video",
        poster_path: "u/b-p.jpg",
      },
    ])
  })
})

describe("wallSelectionToSlideshowPhotos", () => {
  test("keeps wall order and skips missing paths", () => {
    expect(
      wallSelectionToSlideshowPhotos(
        ["b", "a", "missing"],
        [
          {
            id: "a",
            name: "A",
            image_path: "u/a.jpg",
            media_type: "image",
            poster_path: null,
          },
          {
            id: "b",
            name: "B",
            image_path: "u/b.jpg",
            media_type: "video",
            poster_path: "u/b-p.jpg",
          },
        ]
      )
    ).toEqual([
      {
        image_id: "b",
        name: "B",
        image_path: "u/b.jpg",
        media_type: "video",
        poster_path: "u/b-p.jpg",
      },
      {
        image_id: "a",
        name: "A",
        image_path: "u/a.jpg",
        media_type: "image",
        poster_path: null,
      },
    ])
  })
})

describe("expandWallSelectionSlideshowPhotos", () => {
  test("expands multi-shot sequences to siblings", () => {
    expect(
      expandWallSelectionSlideshowPhotos(
        ["story"],
        [
          {
            id: "story",
            name: "Cover",
            image_path: "u/c.jpg",
            media_type: "image",
            poster_path: null,
            sequence_count: 2,
            sequence_items: [
              {
                id: "s0",
                name: "Shot 0",
                image_path: "u/0.jpg",
                media_type: "image",
                poster_path: null,
              },
              {
                id: "s1",
                name: "Shot 1",
                image_path: "u/1.jpg",
                media_type: "video",
                poster_path: "u/1-p.jpg",
              },
            ],
          },
        ]
      )
    ).toEqual([
      {
        image_id: "s0",
        name: "Shot 0",
        image_path: "u/0.jpg",
        media_type: "image",
        poster_path: null,
      },
      {
        image_id: "s1",
        name: "Shot 1",
        image_path: "u/1.jpg",
        media_type: "video",
        poster_path: "u/1-p.jpg",
      },
    ])
  })
})

describe("shuffleSlideshowPhotos", () => {
  test("returns a permutation without mutating input", () => {
    const photos = [
      {
        image_id: "a",
        name: "A",
        image_path: "u/a.jpg",
        media_type: "image" as const,
        poster_path: null,
      },
      {
        image_id: "b",
        name: "B",
        image_path: "u/b.jpg",
        media_type: "image" as const,
        poster_path: null,
      },
      {
        image_id: "c",
        name: "C",
        image_path: "u/c.jpg",
        media_type: "image" as const,
        poster_path: null,
      },
    ]
    const values = [0.9, 0.1, 0.5]
    let i = 0
    const shuffled = shuffleSlideshowPhotos(photos, () => values[i++] ?? 0)
    expect(shuffled.map((p) => p.image_id).sort()).toEqual(["a", "b", "c"])
    expect(photos.map((p) => p.image_id)).toEqual(["a", "b", "c"])
    expect(shuffled).not.toBe(photos)
  })
})
