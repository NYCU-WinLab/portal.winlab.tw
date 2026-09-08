import { describe, expect, test } from "bun:test"

import { stepFocusIndex } from "@/lib/gallery/roving-focus"

describe("stepFocusIndex", () => {
  test("returns -1 for empty lists", () => {
    expect(stepFocusIndex(0, 0, 1)).toBe(-1)
  })

  test("enters the list from an unset focus", () => {
    expect(stepFocusIndex(-1, 3, 1)).toBe(0)
    expect(stepFocusIndex(-1, 3, -1)).toBe(2)
  })

  test("clamps at the ends without wrapping", () => {
    expect(stepFocusIndex(0, 3, -1)).toBe(0)
    expect(stepFocusIndex(2, 3, 1)).toBe(2)
    expect(stepFocusIndex(1, 3, 1)).toBe(2)
  })
})
