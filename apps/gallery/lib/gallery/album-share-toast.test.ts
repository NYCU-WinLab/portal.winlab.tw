import { describe, expect, test } from "bun:test"

import {
  describeAlbumCreateReady,
  describeAlbumShareCopied,
  describeCopyShareLinkLabel,
  describeShareAlbumButtonLabel,
  describeShareAlbumLabel,
} from "@/lib/gallery/album-share-toast"

describe("describeAlbumShareCopied", () => {
  test("returns the clipboard success title", () => {
    expect(describeAlbumShareCopied()).toBe("Share link copied")
    expect(describeAlbumShareCopied().length).toBeGreaterThan(0)
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

describe("share album button labels", () => {
  test("defaults and emphasize", () => {
    expect(describeShareAlbumLabel()).toBe("Share album")
    expect(describeCopyShareLinkLabel()).toBe("Copy share link")
    expect(describeShareAlbumButtonLabel({ emphasize: false })).toBe(
      "Share album"
    )
    expect(describeShareAlbumButtonLabel({ emphasize: true })).toBe(
      "Copy share link"
    )
    expect(
      describeShareAlbumButtonLabel({ emphasize: true, label: "Custom" })
    ).toBe("Custom")
  })
})
