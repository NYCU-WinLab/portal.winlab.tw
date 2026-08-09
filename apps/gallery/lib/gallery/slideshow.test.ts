import { describe, expect, test } from "bun:test"

import {
  clampSlideshowIntervalMs,
  clampSlideshowStartIndex,
  flattenMemoryGroupsForSlideshow,
  GALLERY_SLIDESHOW_DEFAULT_MS,
  nextSlideshowIndex,
  prevSlideshowIndex,
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
