import { describe, expect, test } from "bun:test"

import { resolveLightboxSwipe } from "@/lib/gallery/lightbox-gestures"

describe("resolveLightboxSwipe", () => {
  test("ignores tiny movements", () => {
    expect(resolveLightboxSwipe(10, 10)).toBeNull()
    expect(resolveLightboxSwipe(40, 20)).toBeNull()
  })

  test("prefers horizontal when larger", () => {
    expect(resolveLightboxSwipe(60, 20)).toBe("prev")
    expect(resolveLightboxSwipe(-60, 20)).toBe("next")
  })

  test("maps vertical to sheet open/close", () => {
    expect(resolveLightboxSwipe(10, -60)).toBe("up")
    expect(resolveLightboxSwipe(10, 60)).toBe("down")
  })
})
