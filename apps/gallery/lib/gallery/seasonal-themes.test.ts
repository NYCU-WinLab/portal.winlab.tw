import { describe, expect, test } from "bun:test"

import {
  getSeasonalThemeEnvOverride,
  isGallerySeasonalThemeId,
  parseSeasonalThemeSetting,
} from "@/lib/gallery/seasonal-themes"

describe("isGallerySeasonalThemeId", () => {
  test("accepts dragon-boat", () => {
    expect(isGallerySeasonalThemeId("dragon-boat")).toBe(true)
  })

  test("accepts world-cup", () => {
    expect(isGallerySeasonalThemeId("world-cup")).toBe(true)
  })

  test("rejects unknown ids", () => {
    expect(isGallerySeasonalThemeId("christmas")).toBe(false)
    expect(isGallerySeasonalThemeId(null)).toBe(false)
  })
})

describe("parseSeasonalThemeSetting", () => {
  test("returns null when id is null or missing", () => {
    expect(parseSeasonalThemeSetting({ id: null })).toBe(null)
    expect(parseSeasonalThemeSetting({})).toBe(null)
    expect(parseSeasonalThemeSetting(null)).toBe(null)
  })

  test("returns theme id when valid", () => {
    expect(parseSeasonalThemeSetting({ id: "dragon-boat" })).toBe("dragon-boat")
    expect(parseSeasonalThemeSetting({ id: "world-cup" })).toBe("world-cup")
  })

  test("returns null for invalid id", () => {
    expect(parseSeasonalThemeSetting({ id: "easter" })).toBe(null)
  })
})

describe("getSeasonalThemeEnvOverride", () => {
  test("reads dragon-boat from env", () => {
    process.env.GALLERY_SEASONAL_THEME = "dragon-boat"
    expect(getSeasonalThemeEnvOverride()).toBe("dragon-boat")
    delete process.env.GALLERY_SEASONAL_THEME
  })

  test("reads world-cup from env", () => {
    process.env.GALLERY_SEASONAL_THEME = "world-cup"
    expect(getSeasonalThemeEnvOverride()).toBe("world-cup")
    delete process.env.GALLERY_SEASONAL_THEME
  })

  test("treats off as disabled", () => {
    process.env.GALLERY_SEASONAL_THEME = "off"
    expect(getSeasonalThemeEnvOverride()).toBe(null)
    delete process.env.GALLERY_SEASONAL_THEME
  })
})
