import { describe, expect, test } from "bun:test"

import { nextRadioIndex } from "@/lib/gallery/radio-nav"

describe("nextRadioIndex", () => {
  test("returns 0 for empty groups", () => {
    expect(nextRadioIndex(0, 0, "ArrowRight")).toBe(0)
  })

  test("wraps left and right", () => {
    expect(nextRadioIndex(0, 3, "ArrowLeft")).toBe(2)
    expect(nextRadioIndex(2, 3, "ArrowRight")).toBe(0)
    expect(nextRadioIndex(1, 3, "ArrowUp")).toBe(0)
    expect(nextRadioIndex(1, 3, "ArrowDown")).toBe(2)
  })

  test("Home and End jump to ends", () => {
    expect(nextRadioIndex(2, 4, "Home")).toBe(0)
    expect(nextRadioIndex(0, 4, "End")).toBe(3)
  })

  test("Home and End ignore out-of-range current", () => {
    expect(nextRadioIndex(99, 5, "Home")).toBe(0)
    expect(nextRadioIndex(-3, 5, "End")).toBe(4)
    expect(nextRadioIndex(0, 1, "Home")).toBe(0)
    expect(nextRadioIndex(0, 1, "End")).toBe(0)
  })

  test("clamps an out-of-range current index before moving", () => {
    expect(nextRadioIndex(99, 3, "ArrowLeft")).toBe(1)
    expect(nextRadioIndex(-5, 3, "ArrowRight")).toBe(1)
  })

  test("vertical arrows wrap the same as horizontal", () => {
    expect(nextRadioIndex(0, 3, "ArrowUp")).toBe(2)
    expect(nextRadioIndex(2, 3, "ArrowDown")).toBe(0)
  })
})
