import { describe, expect, test } from "bun:test"

import {
  buildGalleryPhotoHref,
  galleryPhotoPageFromRank,
  isGalleryPhotoId,
} from "@/lib/gallery/photo-deep-link"

describe("galleryPhotoPageFromRank", () => {
  test("maps rank 1 into page 1", () => {
    expect(galleryPhotoPageFromRank(1, 24)).toBe(1)
  })

  test("ceils into later pages", () => {
    expect(galleryPhotoPageFromRank(24, 24)).toBe(1)
    expect(galleryPhotoPageFromRank(25, 24)).toBe(2)
    expect(galleryPhotoPageFromRank(48, 24)).toBe(2)
    expect(galleryPhotoPageFromRank(49, 24)).toBe(3)
  })

  test("guards non-finite and sub-one ranks", () => {
    expect(galleryPhotoPageFromRank(NaN)).toBe(1)
    expect(galleryPhotoPageFromRank(0)).toBe(1)
    expect(galleryPhotoPageFromRank(-3)).toBe(1)
  })
})

describe("isGalleryPhotoId", () => {
  test("accepts UUIDs", () => {
    expect(isGalleryPhotoId("550e8400-e29b-41d4-a716-446655440000")).toBe(true)
  })

  test("rejects non-uuids", () => {
    expect(isGalleryPhotoId("not-a-uuid")).toBe(false)
    expect(isGalleryPhotoId("")).toBe(false)
  })
})

describe("buildGalleryPhotoHref", () => {
  test("builds photo query", () => {
    expect(buildGalleryPhotoHref({ photoId: "photo-1" })).toBe(
      "/?photo=photo-1"
    )
  })

  test("includes page and comment when present", () => {
    expect(
      buildGalleryPhotoHref({
        photoId: "photo-1",
        commentId: "c1",
        page: 3,
      })
    ).toBe("/?page=3&photo=photo-1&comment=c1")
  })

  test("omits page 1", () => {
    expect(buildGalleryPhotoHref({ photoId: "photo-1", page: 1 })).toBe(
      "/?photo=photo-1"
    )
  })
})
