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
      savedOnly: false,
    })
  })

  test("parses uploader, media, after, query, tag, and saved", () => {
    expect(
      parseGalleryHomeFilters({
        uploader: "user-1",
        media: "video",
        after: "2026-01-01T00:00:00.000Z",
        q: "mop",
        tag: "Lab-Trip",
        saved: "1",
      })
    ).toEqual({
      uploaderId: "user-1",
      media: "video",
      uploadedAfter: "2026-01-01T00:00:00.000Z",
      query: "mop",
      tagSlug: "lab-trip",
      savedOnly: true,
    })
  })

  test("ignores invalid media and tag values", () => {
    expect(parseGalleryHomeFilters({ media: "gif" }).media).toBe("all")
    expect(parseGalleryHomeFilters({ tag: "!!!" }).tagSlug).toBeNull()
    expect(parseGalleryHomeFilters({ saved: "yes" }).savedOnly).toBe(false)
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
        savedOnly: false,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "image",
        uploadedAfter: null,
        query: null,
        tagSlug: null,
        savedOnly: false,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: "test",
        tagSlug: null,
        savedOnly: false,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: null,
        tagSlug: "lab-trip",
        savedOnly: false,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: null,
        tagSlug: null,
        savedOnly: true,
      })
    ).toBe(true)
    expect(
      hasActiveGalleryFilters({
        uploaderId: null,
        media: "all",
        uploadedAfter: null,
        query: null,
        tagSlug: null,
        savedOnly: false,
      })
    ).toBe(false)
  })
})

describe("buildGalleryHomeHref", () => {
  test("omits defaults and encodes filters", () => {
    expect(buildGalleryHomeHref({})).toBe("/")
    expect(
      buildGalleryHomeHref({
        page: 2,
        filters: {
          uploaderId: "u1",
          media: "video",
          uploadedAfter: "2026-01-01",
          query: "hello",
          tagSlug: "lab",
          savedOnly: true,
        },
        photoId: "p1",
      })
    ).toBe(
      "/?page=2&uploader=u1&media=video&after=2026-01-01&q=hello&tag=lab&saved=1&photo=p1"
    )
  })
})

describe("describeGalleryFilterSummary", () => {
  test("lists active chips including Saved", () => {
    expect(
      describeGalleryFilterSummary(
        {
          uploaderId: null,
          media: "all",
          uploadedAfter: null,
          query: "mop",
          tagSlug: null,
          savedOnly: true,
        },
        []
      )
    ).toEqual(["Saved", '"mop"'])
  })
})
