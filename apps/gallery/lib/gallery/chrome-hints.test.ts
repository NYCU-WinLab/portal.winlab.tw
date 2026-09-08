import { describe, expect, test } from "bun:test"

import {
  describeClearBrokenShotsAriaLabel,
  describeLimitedSeasonalThemeHint,
  describeMediaHealthClearAllLabel,
  describePaperWallThemeHint,
  describeWallSelectModeHint,
} from "@/lib/gallery/chrome-hints"

describe("chrome hints", () => {
  test("seasonal theme hints", () => {
    expect(describePaperWallThemeHint()).toBe("Default darkroom renewal")
    expect(describeLimitedSeasonalThemeHint()).toBe("Limited-time overlay")
  })

  test("media health and wall select hints", () => {
    expect(describeClearBrokenShotsAriaLabel()).toBe(
      "Clear all selected broken shots"
    )
    expect(describeMediaHealthClearAllLabel()).toBe("Clear all")
    expect(describeWallSelectModeHint()).toBe(
      "Select mode · Shift+click for ranges · bulk tools below"
    )
  })
})
