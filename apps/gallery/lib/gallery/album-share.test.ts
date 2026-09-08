import { describe, expect, test } from "bun:test"

import {
  buildGalleryAlbumHref,
  buildGalleryAlbumShareUrl,
  shareOrCopyAlbumLink,
} from "@/lib/gallery/album-share"

describe("buildGalleryAlbumHref", () => {
  test("builds path from a valid slug", () => {
    expect(buildGalleryAlbumHref("lab-retreat-2026")).toBe(
      "/albums/lab-retreat-2026"
    )
  })

  test("normalizes case and trims", () => {
    expect(buildGalleryAlbumHref("  Demo-Day  ")).toBe("/albums/demo-day")
  })

  test("rejects empty or unsafe slugs", () => {
    expect(buildGalleryAlbumHref("")).toBeNull()
    expect(buildGalleryAlbumHref("!!!")).toBeNull()
    expect(buildGalleryAlbumHref("../escape")).toBeNull()
    expect(buildGalleryAlbumHref("a/b")).toBeNull()
  })
})

describe("buildGalleryAlbumShareUrl", () => {
  test("joins origin and path", () => {
    expect(
      buildGalleryAlbumShareUrl("lab-trip", "https://gallery.winlab.tw/")
    ).toBe("https://gallery.winlab.tw/albums/lab-trip")
  })

  test("returns null without a usable origin in non-browser context", () => {
    expect(buildGalleryAlbumShareUrl("lab-trip", null)).toBeNull()
    expect(buildGalleryAlbumShareUrl("lab-trip", "")).toBeNull()
  })
})

describe("shareOrCopyAlbumLink", () => {
  test("soft-fails on invalid slug without throwing", async () => {
    const result = await shareOrCopyAlbumLink({
      slug: "!!!",
      title: "Nope",
      preferCopy: true,
      origin: "https://gallery.winlab.tw",
    })
    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: "Invalid album link",
    })
  })

  test("soft-fails when clipboard is unavailable", async () => {
    const result = await shareOrCopyAlbumLink({
      slug: "lab-trip",
      title: "Lab trip",
      preferCopy: true,
      origin: "https://gallery.winlab.tw",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("clipboard")
    }
  })
})
