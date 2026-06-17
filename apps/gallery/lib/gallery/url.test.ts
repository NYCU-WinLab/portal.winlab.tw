import { describe, expect, test } from "bun:test"

import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

const BASE = "https://example.supabase.co"

describe("getGalleryImageUrl", () => {
  test("builds public object URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    expect(getGalleryImageUrl("user/photo.jpg")).toBe(
      `${BASE}/storage/v1/object/public/gallery/user/photo.jpg`
    )
  })

  test("encodes path segments", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    expect(getGalleryImageUrl("user/a b.jpg")).toBe(
      `${BASE}/storage/v1/object/public/gallery/user/a%20b.jpg`
    )
  })
})

describe("getGalleryThumbUrl", () => {
  test("builds render URL with transform params", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    const url = getGalleryThumbUrl("user/photo.jpg", 400)
    expect(url).toStartWith(
      `${BASE}/storage/v1/render/image/public/gallery/user/photo.jpg?`
    )
    const params = new URL(url).searchParams
    expect(params.get("width")).toBe("400")
    expect(params.get("resize")).toBe("cover")
  })
})
