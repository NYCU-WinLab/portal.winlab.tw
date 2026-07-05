import { describe, expect, test } from "bun:test"

import { isIosDevice, isStandaloneDisplayMode } from "@/lib/gallery/pwa"

describe("isIosDevice", () => {
  test("detects iPhone user agent", () => {
    expect(
      isIosDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe(true)
  })

  test("returns false for Android", () => {
    expect(
      isIosDevice(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile"
      )
    ).toBe(false)
  })
})

describe("isStandaloneDisplayMode", () => {
  test("detects standalone via display-mode", () => {
    expect(isStandaloneDisplayMode(true, false)).toBe(true)
  })

  test("detects iOS standalone flag", () => {
    expect(isStandaloneDisplayMode(false, true)).toBe(true)
  })

  test("returns false in browser tab", () => {
    expect(isStandaloneDisplayMode(false, false)).toBe(false)
  })
})
