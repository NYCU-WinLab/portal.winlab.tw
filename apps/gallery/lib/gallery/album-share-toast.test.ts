import { describe, expect, test } from "bun:test"

import {
  describeAlbumCreateReady,
  describeAlbumShareCopied,
} from "@/lib/gallery/album-share-toast"

describe("describeAlbumShareCopied", () => {
  test("returns the clipboard success title", () => {
    expect(describeAlbumShareCopied()).toBe("Share link copied")
  })
})

describe("describeAlbumCreateReady", () => {
  test("mentions link when it was copied", () => {
    expect(
      describeAlbumCreateReady({ title: "Lab retreat", linkCopied: true })
    ).toBe("Album “Lab retreat” ready — link copied")
  })

  test("omits link copy when only create succeeded", () => {
    expect(
      describeAlbumCreateReady({ title: "Demo day", linkCopied: false })
    ).toBe("Album “Demo day” is ready")
  })
})
