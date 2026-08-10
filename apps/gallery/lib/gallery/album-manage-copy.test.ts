import { describe, expect, test } from "bun:test"

import { describeAlbumPhotosRemoved } from "@/lib/gallery/album-manage-copy"

describe("describeAlbumPhotosRemoved", () => {
  test("singular and plural", () => {
    expect(describeAlbumPhotosRemoved(1)).toBe("Removed 1 photo from album")
    expect(describeAlbumPhotosRemoved(3)).toBe("Removed 3 photos from album")
  })

  test("zero uses plural form", () => {
    expect(describeAlbumPhotosRemoved(0)).toBe("Removed 0 photos from album")
  })
})
