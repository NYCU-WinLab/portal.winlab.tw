import { describe, expect, test } from "bun:test"

import {
  describeMoveDownAriaLabel,
  describeMoveUpAriaLabel,
  describeRemoveFromAlbumAriaLabel,
  describeSelectAllPhotosAriaLabel,
} from "@/lib/gallery/album-manage-labels"

describe("album manage labels", () => {
  test("reorder and selection aria-labels", () => {
    expect(describeSelectAllPhotosAriaLabel()).toBe("Select all photos")
    expect(describeMoveUpAriaLabel()).toBe("Move up")
    expect(describeMoveDownAriaLabel()).toBe("Move down")
    expect(describeRemoveFromAlbumAriaLabel()).toBe("Remove from album")
  })
})
