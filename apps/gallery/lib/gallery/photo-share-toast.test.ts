import { describe, expect, test } from "bun:test"

import {
  describePhotoLinkCopied,
  describeSavedOriginal,
} from "@/lib/gallery/photo-share-toast"

describe("describePhotoLinkCopied", () => {
  test("returns the clipboard success title", () => {
    expect(describePhotoLinkCopied()).toBe("Link copied.")
  })
})

describe("describeSavedOriginal", () => {
  test("returns the download success title", () => {
    expect(describeSavedOriginal()).toBe("Saved original")
  })
})
