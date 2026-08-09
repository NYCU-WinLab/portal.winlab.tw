import { describe, expect, test } from "bun:test"

import {
  buildGalleryHomeHref,
  describeGalleryFilterSummary,
  hasActiveGalleryFilters,
  parseGalleryHomeFilters,
} from "@/lib/gallery/home-filters"

describe("parseGalleryHomeFilters", () => {
  test("defaults to empty filters", () => {
    expect(parseGalleryHomeFilters({})).toEqual({
      uploaderId: null,
      media: "all",
      uploadedAfter: null,
      query: null,
      tagSlug: null,
    })
  })

  test("parses uploader, media, after, query, and tag", () => {
    expect(
      parseGalleryHomeFilters({
        uploader: "user-1",
        media: "video",
        after: "2026-01-01T00:00:00.000Z",
        q: "mop",
        tag: "Lab-Trip",
      })
    ).toEqual({
      uploaderId: "user-1",
      media: "video",
      uploadedAfter: "2026-01-01T00:00:00.000Z",
      query: "mop",
      tagSlug: "lab-trip",
    })
  })

  test("ignores invalid media and tag values", () => {
    expect(parseGalleryHomeFilters({ media: "gif" }).media).toBe("all")
    expect(parseGalleryHomeFilters({ tag: "!!!" }).tagSlug).toBeNull()
  })
})

describe("hasActiveGalleryFilters", () => {
  test("detects active filters", () => {
    expect(
      hasActiveGalleryFilters({
        uploaderId: "x",
        media: "all",
        uploadedAfter: null,
        query: null,
        tagSlug: null,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "image",
        uploadedAfter: null,
        query: null,
        tagSlug: null,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: "test",
        tagSlug: null,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: null,
        tagSlug: "lab-trip",
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
          query: "mop",
          tagSlug: "lab-trip",
        },
      })
    ).toBe(
      "/?page=2&uploader=user-1&media=image&after=2026-01-01T00%3A00%3A00.000Z&q=mop&tag=lab-trip&photo=photo-1&comment=comment-1"
    )
  })
})

describe("describeGalleryFilterSummary", () => {
  test("joins active filter labels", () => {
    expect(
      describeGalleryFilterSummary(
        {
          uploaderId: "user-1",
          media: "image",
          uploadedAfter: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          query: "mop",
          tagSlug: "lab-trip",
        },
        [{ id: "user-1", name: "Alice", email: null }],
        "Lab trip"
      )
    ).toEqual(["Lab trip", "Alice", "Photos", "This week", '"mop"'])
  })
})
