import { describe, expect, test } from "bun:test"

import { shouldStopLightboxEscape } from "@/lib/gallery/reaction-escape"

describe("shouldStopLightboxEscape", () => {
  test("stops Esc while the picker is open", () => {
    expect(shouldStopLightboxEscape(true)).toBe(true)
    expect(shouldStopLightboxEscape(false)).toBe(false)
  })
})
