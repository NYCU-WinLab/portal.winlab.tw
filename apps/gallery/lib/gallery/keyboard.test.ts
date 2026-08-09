import { describe, expect, test } from "bun:test"

import { isTypingTarget } from "@/lib/gallery/keyboard"

describe("isTypingTarget", () => {
  test("returns false for null", () => {
    expect(isTypingTarget(null)).toBe(false)
  })
})
