import { describe, expect, test } from "bun:test"

import {
  isGalleryTagsUnavailable,
  normalizeGalleryTagName,
  normalizeGalleryTagSlug,
  parseGalleryTagList,
} from "@/lib/gallery/tags"

describe("normalizeGalleryTagSlug", () => {
  test("lowercases and hyphenates", () => {
    expect(normalizeGalleryTagSlug("  Lab Trip  ")).toBe("lab-trip")
    expect(normalizeGalleryTagSlug("New_Year!!")).toBe("new-year")
  })

  test("rejects empty leftovers", () => {
    expect(normalizeGalleryTagSlug("!!!")).toBeNull()
    expect(normalizeGalleryTagSlug("   ")).toBeNull()
  })
})

describe("normalizeGalleryTagName", () => {
  test("keeps readable casing", () => {
    expect(normalizeGalleryTagName("  Lab  Trip ")).toBe("Lab Trip")
  })

  test("rejects overlong names", () => {
    expect(normalizeGalleryTagName("x".repeat(41))).toBeNull()
  })
})

describe("parseGalleryTagList", () => {
  test("dedupes by slug and caps count", () => {
    expect(parseGalleryTagList(["Lab Trip", "lab-trip", "Sunset"])).toEqual([
      "Lab Trip",
      "Sunset",
    ])
  })

  test("drops unusable entries", () => {
    expect(parseGalleryTagList(["!!!", "", "ok"])).toEqual(["ok"])
  })
})

describe("isGalleryTagsUnavailable", () => {
  test("detects missing table in schema cache", () => {
    expect(
      isGalleryTagsUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_image_tags' in the schema cache",
      })
    ).toBe(true)
  })

  test("detects missing relation", () => {
    expect(
      isGalleryTagsUnavailable({
        code: "42P01",
        message: 'relation "gallery_image_tags" does not exist',
      })
    ).toBe(true)
  })

  test("detects missing RPC", () => {
    expect(
      isGalleryTagsUnavailable({
        code: "PGRST202",
        message:
          "Could not find the function public.gallery_wall_cover_ids_for_tag",
      })
    ).toBe(true)
  })

  test("ignores unrelated errors", () => {
    expect(
      isGalleryTagsUnavailable({
        code: "42501",
        message: "permission denied for table gallery_images",
      })
    ).toBe(false)
  })
})
