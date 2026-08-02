import { describe, expect, test } from "bun:test"

import { GALLERY_PAGE_SIZE } from "@/lib/gallery/load-home-page"
import {
  galleryPhotoPageFromRank,
  isGalleryPhotoId,
} from "@/lib/gallery/photo-deep-link"

describe("galleryPhotoPageFromRank", () => {
  test("first photo is page 1", () => {
    expect(galleryPhotoPageFromRank(1)).toBe(1)
  })

  test("last slot on page 1 stays on page 1", () => {
    expect(galleryPhotoPageFromRank(GALLERY_PAGE_SIZE)).toBe(1)
  })

  test("first photo on page 2", () => {
    expect(galleryPhotoPageFromRank(GALLERY_PAGE_SIZE + 1)).toBe(2)
  })

  test("guards invalid ranks", () => {
    expect(galleryPhotoPageFromRank(0)).toBe(1)
    expect(galleryPhotoPageFromRank(-3)).toBe(1)
  })
})

describe("isGalleryPhotoId", () => {
  test("accepts a uuid", () => {
    expect(isGalleryPhotoId("1b14a005-1838-4f04-a888-429fbb5d9c8b")).toBe(true)
  })

  test("rejects junk", () => {
    expect(isGalleryPhotoId("test")).toBe(false)
    expect(isGalleryPhotoId("")).toBe(false)
  })
})
