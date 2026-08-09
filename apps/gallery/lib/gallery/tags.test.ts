import { describe, expect, test } from "bun:test"

import {
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
