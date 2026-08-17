import { describe, expect, test } from "bun:test"

import {
  describeDismissInstallPromptAriaLabel,
  describeInstallLabel,
  describeSeasonalSiteThemeAriaLabel,
} from "@/lib/gallery/install-theme-labels"

describe("install and seasonal theme labels", () => {
  test("aria-labels", () => {
    expect(describeDismissInstallPromptAriaLabel()).toBe(
      "Dismiss install prompt"
    )
    expect(describeSeasonalSiteThemeAriaLabel()).toBe("Seasonal site theme")
  })

  test("install idle label", () => {
    expect(describeInstallLabel()).toBe("Install")
  })
})
