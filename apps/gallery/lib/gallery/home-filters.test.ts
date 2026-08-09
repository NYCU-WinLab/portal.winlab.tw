import { describe, expect, test } from "bun:test"

import {
  EMPTY_GALLERY_HOME_FILTERS,
  buildGalleryHomeHref,
  describeGalleryFilterSummary,
  describeGalleryFilteredEmpty,
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
      albumSlug: null,
    })
  })

  test("parses uploader, media, after, query, tag, saved, and album", () => {
    expect(
      parseGalleryHomeFilters({
        uploader: "user-1",
        media: "video",
        after: "2026-01-01T00:00:00.000Z",
        q: "mop",
        tag: "Lab-Trip",
        saved: "1",
        album: "Lab-Retreat",
      })
    ).toEqual({
      uploaderId: "user-1",
      media: "video",
      uploadedAfter: "2026-01-01T00:00:00.000Z",
      query: "mop",
      tagSlug: "lab-trip",
      savedOnly: true,
      albumSlug: "lab-retreat",
    })
  })

  test("ignores invalid media, tag, and album values", () => {
    expect(parseGalleryHomeFilters({ media: "gif" }).media).toBe("all")
    expect(parseGalleryHomeFilters({ tag: "!!!" }).tagSlug).toBeNull()
    expect(parseGalleryHomeFilters({ saved: "yes" }).savedOnly).toBe(false)
    expect(parseGalleryHomeFilters({ album: "!!!" }).albumSlug).toBeNull()
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
        albumSlug: null,
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
        albumSlug: null,
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
        albumSlug: null,
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
        albumSlug: null,
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
        albumSlug: null,
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
        albumSlug: "lab-trip",
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
        albumSlug: null,
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
          albumSlug: "retreat",
        },
        photoId: "p1",
      })
    ).toBe(
      "/?page=2&uploader=u1&media=video&after=2026-01-01&q=hello&tag=lab&saved=1&album=retreat&photo=p1"
    )
  })
})

describe("describeGalleryFilterSummary", () => {
  test("lists active chips including Saved and album", () => {
    expect(
      describeGalleryFilterSummary(
        {
          uploaderId: null,
          media: "all",
          uploadedAfter: null,
          query: "mop",
          tagSlug: null,
          savedOnly: true,
          albumSlug: "lab-trip",
        },
        []
      )
    ).toEqual(["Saved", "Album · lab-trip", '"mop"'])
  })
})

describe("describeGalleryFilteredEmpty", () => {
  test("uses Saved-specific copy when only Saved is on", () => {
    expect(
      describeGalleryFilteredEmpty(
        {
          ...EMPTY_GALLERY_HOME_FILTERS,
          savedOnly: true,
        },
        []
      ).title
    ).toBe("No saved photos yet")
  })

  test("uses tag-specific copy when only a tag is on", () => {
    expect(
      describeGalleryFilteredEmpty(
        {
          ...EMPTY_GALLERY_HOME_FILTERS,
          tagSlug: "lab-day",
        },
        [],
        "Lab day"
      )
    ).toEqual({
      title: "No photos with this tag",
      description: "Nothing is tagged Lab day on the wall yet.",
    })
  })

  test("falls back to chip summary for combined filters", () => {
    expect(
      describeGalleryFilteredEmpty(
        {
          ...EMPTY_GALLERY_HOME_FILTERS,
          savedOnly: true,
          query: "axolotl",
        },
        []
      )
    ).toEqual({
      title: "No matches",
      description: 'Nothing matches Saved · "axolotl".',
    })
  })
})
