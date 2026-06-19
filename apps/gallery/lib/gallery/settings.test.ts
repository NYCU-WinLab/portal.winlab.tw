import { describe, expect, test } from "bun:test"

import { isGallerySettingsUnavailable } from "@/lib/gallery/settings"

describe("isGallerySettingsUnavailable", () => {
  test("detects missing table in schema cache", () => {
    expect(
      isGallerySettingsUnavailable({
        code: "PGRST205",
        message: "Could not find the table 'public.gallery_settings'",
      })
    ).toBe(true)
  })

  test("detects postgres undefined_table", () => {
    expect(
      isGallerySettingsUnavailable({
        code: "42P01",
        message: 'relation "gallery_settings" does not exist',
      })
    ).toBe(true)
  })

  test("returns false for other errors", () => {
    expect(
      isGallerySettingsUnavailable({
        code: "42501",
        message: "permission denied",
      })
    ).toBe(false)
    expect(isGallerySettingsUnavailable(null)).toBe(false)
  })
})
