import { describe, expect, test } from "bun:test"

import {
  describeAlbumCoverUpdated,
  describeAlbumDeleted,
  describeAlbumPhotoRemoved,
  describeAlbumPhotosRemoved,
  describeAlbumUpdated,
} from "@/lib/gallery/album-manage-copy"

describe("describeAlbumPhotosRemoved", () => {
  test("singular and plural", () => {
    expect(describeAlbumPhotosRemoved(1)).toBe("Removed 1 photo from album")
    expect(describeAlbumPhotosRemoved(3)).toBe("Removed 3 photos from album")
  })

  test("zero uses plural form", () => {
    expect(describeAlbumPhotosRemoved(0)).toBe("Removed 0 photos from album")
  })
})

describe("album manage toast helpers", () => {
  test("describeAlbumUpdated", () => {
    expect(describeAlbumUpdated()).toBe("Album updated")
  })

  test("describeAlbumPhotoRemoved", () => {
    expect(describeAlbumPhotoRemoved()).toBe("Removed from album")
  })

  test("describeAlbumCoverUpdated", () => {
    expect(describeAlbumCoverUpdated()).toBe("Cover updated")
  })

  test("describeAlbumDeleted", () => {
    expect(describeAlbumDeleted()).toBe("Album deleted")
  })
})
