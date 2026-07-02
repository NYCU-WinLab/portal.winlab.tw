import { describe, expect, test } from "bun:test"

import {
  buildGalleryHomeHref,
  hasActiveGalleryFilters,
  parseGalleryHomeFilters,
} from "@/lib/gallery/home-filters"

describe("parseGalleryHomeFilters", () => {
  test("defaults to empty filters", () => {
    expect(parseGalleryHomeFilters({})).toEqual({
      uploaderId: null,
      media: "all",
      uploadedAfter: null,
    })
  })

  test("parses uploader, media, and after", () => {
    expect(
      parseGalleryHomeFilters({
        uploader: "user-1",
        media: "video",
        after: "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({
      uploaderId: "user-1",
      media: "video",
      uploadedAfter: "2026-01-01T00:00:00.000Z",
    })
  })

  test("ignores invalid media values", () => {
    expect(parseGalleryHomeFilters({ media: "gif" }).media).toBe("all")
  })
})

describe("hasActiveGalleryFilters", () => {
  test("detects active filters", () => {
    expect(
      hasActiveGalleryFilters({
        uploaderId: "x",
        media: "all",
        uploadedAfter: null,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "image",
        uploadedAfter: null,
      })
    ).toBe(true)
  })
})

describe("buildGalleryHomeHref", () => {
  test("builds filter and deep-link query string", () => {
    expect(
      buildGalleryHomeHref({
        page: 2,
        photoId: "photo-1",
        commentId: "comment-1",
        filters: {
          uploaderId: "user-1",
          media: "image",
          uploadedAfter: "2026-01-01T00:00:00.000Z",
        },
      })
    ).toBe(
      "/?page=2&uploader=user-1&media=image&after=2026-01-01T00%3A00%3A00.000Z&photo=photo-1&comment=comment-1"
    )
  })
})
