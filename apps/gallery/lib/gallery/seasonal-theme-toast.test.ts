import { describe, expect, test } from "bun:test"

import { describeSeasonalThemeToast } from "@/lib/gallery/seasonal-theme-toast"

describe("describeSeasonalThemeToast", () => {
  test("names an active seasonal theme", () => {
    expect(describeSeasonalThemeToast("world-cup")).toContain("theme is on.")
  })

  test("falls back to paper wall when cleared", () => {
    expect(describeSeasonalThemeToast(null)).toBe("Back to paper wall.")
  })
})
