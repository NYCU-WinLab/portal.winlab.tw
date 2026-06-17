import { describe, expect, test } from "bun:test"

import { getRotation } from "./rotation"

describe("getRotation", () => {
  test("is deterministic — same id, same angle (hydration-stable)", () => {
    expect(getRotation("abc")).toBe(getRotation("abc"))
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    expect(getRotation(uuid)).toBe(getRotation(uuid))
  })

  test("stays within ±4 degrees across a sample of ids", () => {
    const ids = [
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "deadbeef-cafe-babe-0000-000000000000",
    ]
    for (const id of ids) {
      expect(Math.abs(getRotation(id))).toBeLessThanOrEqual(4)
    }
  })

  test("a fully non-hex id exercises the fallback hash and stays finite & in range", () => {
    const r = getRotation("gggggggg")
    expect(Number.isFinite(r)).toBe(true)
    expect(Math.abs(r)).toBeLessThanOrEqual(4)
  })

  test("rounds to at most two decimal places", () => {
    const r = getRotation("3f2504e0-4f89-41d3-9a0c-0305e82c3301")
    expect(Number(r.toFixed(2))).toBe(r)
  })
})
