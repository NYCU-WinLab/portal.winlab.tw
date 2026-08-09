import { describe, expect, test } from "bun:test"

import {
  buildGalleryPhotoMetadata,
  resolveGallerySiteOrigin,
} from "@/lib/gallery/og-metadata"

const BASE = "https://example.supabase.co"

describe("resolveGallerySiteOrigin", () => {
  test("uses http for localhost hosts", () => {
    expect(resolveGallerySiteOrigin("localhost:3005")).toBe(
      "http://localhost:3005"
    )
    expect(resolveGallerySiteOrigin("127.0.0.1:3005")).toBe(
      "http://127.0.0.1:3005"
    )
  })

  test("uses https for production hosts", () => {
    expect(resolveGallerySiteOrigin("gallery.winlab.tw")).toBe(
      "https://gallery.winlab.tw"
    )
  })

  test("falls back to gallery.winlab.tw when host is missing", () => {
    expect(resolveGallerySiteOrigin(null)).toBe("https://gallery.winlab.tw")
  })
})

describe("buildGalleryPhotoMetadata", () => {
  test("builds OG + Twitter cards for still photos", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    const meta = buildGalleryPhotoMetadata(
      {
        name: "Lab night",
        image_path: "user/shot.jpg",
        media_type: "image",
        poster_path: null,
      },
      "https://gallery.winlab.tw",
      "photo-1"
    )

    expect(meta.title).toBe("Lab night — Gallery")
    expect(meta.openGraph?.url).toBe("https://gallery.winlab.tw/?photo=photo-1")
    expect(meta.openGraph?.title).toBe("Lab night")
    const images = meta.openGraph?.images
    expect(Array.isArray(images)).toBe(true)
    if (Array.isArray(images)) {
      const first = images[0]
      expect(typeof first === "object" && first && "url" in first).toBe(true)
      if (typeof first === "object" && first && "url" in first) {
        expect(String(first.url)).toContain(
          "/storage/v1/render/image/public/gallery/user/shot.jpg"
        )
      }
    }
  })

  test("prefers poster_path for video thumbs", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    const meta = buildGalleryPhotoMetadata(
      {
        name: "Kickoff",
        image_path: "user/clip.mp4",
        media_type: "video",
        poster_path: "user/clip-poster.jpg",
      },
      "https://gallery.winlab.tw",
      "vid-1"
    )

    const images = meta.twitter?.images
    expect(Array.isArray(images)).toBe(true)
    if (Array.isArray(images)) {
      expect(String(images[0])).toContain("user/clip-poster.jpg")
      expect(String(images[0])).not.toContain("clip.mp4")
    }
  })
})
