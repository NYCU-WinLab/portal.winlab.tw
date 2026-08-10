import { describe, expect, test } from "bun:test"

import {
  describeDismissInstallPromptAriaLabel,
  describeSeasonalSiteThemeAriaLabel,
} from "@/lib/gallery/install-theme-labels"

describe("install and seasonal theme labels", () => {
  test("aria-labels", () => {
    expect(describeDismissInstallPromptAriaLabel()).toBe(
      "Dismiss install prompt"
    )
    expect(describeSeasonalSiteThemeAriaLabel()).toBe("Seasonal site theme")
  })
})
