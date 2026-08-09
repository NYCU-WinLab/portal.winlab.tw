import { describe, expect, test } from "bun:test"

import {
  buildGallerySwCacheMessage,
  GALLERY_SW_CACHE_URLS_TYPE,
  GALLERY_SW_VERSION,
  isGalleryStorageMediaUrl,
} from "@/lib/gallery/offline-cache"

describe("isGalleryStorageMediaUrl", () => {
  test("accepts object and render gallery URLs", () => {
    expect(
      isGalleryStorageMediaUrl(
        "https://x.supabase.co/storage/v1/object/public/gallery/u/a.jpg"
      )
    ).toBe(true)
    expect(
      isGalleryStorageMediaUrl(
        "https://x.supabase.co/storage/v1/render/image/public/gallery/u/a.jpg?width=480"
      )
    ).toBe(true)
  })

  test("rejects unrelated urls", () => {
    expect(isGalleryStorageMediaUrl("https://example.com/photo.jpg")).toBe(
      false
    )
  })
})

describe("GALLERY_SW_VERSION", () => {
  test("tracks the active service-worker cache generation", () => {
    expect(GALLERY_SW_VERSION).toBe("gallery-sw-v5")
  })
})

describe("buildGallerySwCacheMessage", () => {
  test("dedupes urls", () => {
    const message = buildGallerySwCacheMessage([
      "https://x.supabase.co/storage/v1/object/public/gallery/u/a.jpg",
      "https://x.supabase.co/storage/v1/object/public/gallery/u/a.jpg",
      "",
    ])
    expect(message.type).toBe(GALLERY_SW_CACHE_URLS_TYPE)
    expect(message.urls).toHaveLength(1)
  })

  test("caps batch size", () => {
    const urls = Array.from(
      { length: 10 },
      (_, i) =>
        `https://x.supabase.co/storage/v1/object/public/gallery/u/${i}.jpg`
    )
    expect(buildGallerySwCacheMessage(urls, 3).urls).toHaveLength(3)
  })
})
