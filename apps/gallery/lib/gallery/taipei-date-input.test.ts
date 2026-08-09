import { describe, expect, test } from "bun:test"

import {
  fromTaipeiDateInput,
  toTaipeiDateInput,
} from "@/lib/gallery/taipei-date-input"

describe("toTaipeiDateInput", () => {
  test("returns empty for nullish or invalid", () => {
    expect(toTaipeiDateInput(null)).toBe("")
    expect(toTaipeiDateInput(undefined)).toBe("")
    expect(toTaipeiDateInput("not-a-date")).toBe("")
  })

  test("formats the Taipei calendar day", () => {
    // 2026-08-09 16:00Z == 2026-08-10 00:00 Taipei
    expect(toTaipeiDateInput("2026-08-09T16:00:00.000Z")).toBe("2026-08-10")
    // Still 2026-08-09 in Taipei
    expect(toTaipeiDateInput("2026-08-09T15:59:00.000Z")).toBe("2026-08-09")
  })
})

describe("fromTaipeiDateInput", () => {
  test("anchors noon Taipei", () => {
    expect(fromTaipeiDateInput("2026-08-10")).toBe("2026-08-10T12:00:00+08:00")
    expect(fromTaipeiDateInput(" 2026-08-10 ")).toBe(
      "2026-08-10T12:00:00+08:00"
    )
  })
})
