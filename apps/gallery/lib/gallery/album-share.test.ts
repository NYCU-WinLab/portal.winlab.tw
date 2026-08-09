import { describe, expect, test } from "bun:test"

import {
  buildGalleryAlbumHref,
  buildGalleryAlbumShareUrl,
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
