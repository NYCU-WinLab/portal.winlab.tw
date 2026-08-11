import { describe, expect, test } from "bun:test"

import { describeWallAlbumPhotosRemoved } from "@/lib/gallery/wall-album-remove-toast"

describe("describeWallAlbumPhotosRemoved", () => {
  test("singular", () => {
    expect(describeWallAlbumPhotosRemoved(1)).toBe(
      "Removed 1 photo from this album."
    )
  })

  test("plural and zero", () => {
    expect(describeWallAlbumPhotosRemoved(3)).toBe(
      "Removed 3 photos from this album."
    )
    expect(describeWallAlbumPhotosRemoved(0)).toBe(
      "Removed 0 photos from this album."
    )
  })
})
