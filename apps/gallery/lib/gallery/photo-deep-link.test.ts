import { describe, expect, test } from "bun:test"

import { GALLERY_PAGE_SIZE } from "@/lib/gallery/load-home-page"
import { galleryPhotoPageFromRank } from "@/lib/gallery/photo-deep-link"

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
