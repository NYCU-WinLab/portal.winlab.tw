import { describe, expect, test } from "bun:test"

import { describeKonamiWinLabAriaLabel } from "@/lib/gallery/konami-labels"

describe("konami labels", () => {
  test("overlay aria-label", () => {
    expect(describeKonamiWinLabAriaLabel()).toBe("WinLab")
  })
})
