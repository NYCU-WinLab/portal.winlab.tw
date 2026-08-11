import { describe, expect, test } from "bun:test"

import {
  describeBulkPinResult,
  GALLERY_BULK_PIN_MAX,
  normalizeGalleryPinImageIds,
} from "@/lib/gallery/bulk-pin"

describe("normalizeGalleryPinImageIds", () => {
  test("trims, dedupes, preserves order", () => {
    expect(normalizeGalleryPinImageIds([" a ", "a", "b", ""])).toEqual([
      "a",
      "b",
    ])
  })

  test("caps at bulk max", () => {
    const ids = Array.from({ length: GALLERY_BULK_PIN_MAX + 5 }, (_, i) =>
      String(i)
    )
    expect(normalizeGalleryPinImageIds(ids)).toHaveLength(GALLERY_BULK_PIN_MAX)
  })
})

describe("describeBulkPinResult", () => {
  test("all ok", () => {
    expect(describeBulkPinResult({ pinned: true, ok: 2, failed: 0 })).toBe(
      "Pinned 2 photos."
    )
  })

  test("partial", () => {
    expect(describeBulkPinResult({ pinned: false, ok: 1, failed: 2 })).toBe(
      "Unpinned 1; 2 failed."
    )
  })
})
