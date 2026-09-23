import { describe, expect, test } from "bun:test"

import {
  DURATION_PRESET_MINUTES,
  DURATION_PRESETS,
  SLOT_MINUTES,
  maxDurationMinutes,
  parseCustomDuration,
} from "./duration"

describe("DURATION_PRESETS", () => {
  test("every preset lands on the slot grid", () => {
    for (const p of DURATION_PRESETS) {
      expect(p.minutes % SLOT_MINUTES).toBe(0)
      expect(p.minutes).toBeGreaterThan(0)
    }
  })

  test("the minutes-only list mirrors the presets in order", () => {
    expect(DURATION_PRESET_MINUTES).toEqual([30, 60, 90, 120, 150, 180])
  })
})

describe("maxDurationMinutes", () => {
  test("is the remaining slots times the slot length", () => {
    // 28 slots = 08:00–22:00; starting at 21:00 (index 26) leaves two.
    expect(maxDurationMinutes(28, 26)).toBe(60)
    expect(maxDurationMinutes(28, 0)).toBe(28 * 30)
  })

  test("the last slot still allows one slot", () => {
    expect(maxDurationMinutes(28, 27)).toBe(30)
  })

  test("never goes negative for an out-of-range start", () => {
    expect(maxDurationMinutes(28, 30)).toBe(0)
  })
})

describe("parseCustomDuration", () => {
  test("accepts a multiple of the slot within the limit", () => {
    expect(parseCustomDuration("240", 600)).toEqual({ ok: true, minutes: 240 })
  })

  test("tolerates surrounding whitespace", () => {
    expect(parseCustomDuration(" 90 ", 600)).toEqual({ ok: true, minutes: 90 })
  })

  test("accepts exactly the time left in the day", () => {
    expect(parseCustomDuration("60", 60)).toEqual({ ok: true, minutes: 60 })
  })

  test("rejects one slot past the end of the day", () => {
    const r = parseCustomDuration("90", 60)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("60")
  })

  test("says so when nothing is left after the start", () => {
    const r = parseCustomDuration("30", 0)
    expect(r.ok).toBe(false)
  })

  test("rejects durations off the 30-minute grid", () => {
    expect(parseCustomDuration("45", 600).ok).toBe(false)
    expect(parseCustomDuration("20", 600).ok).toBe(false)
  })

  test("rejects empty, zero, negative, fractional and non-numeric input", () => {
    for (const bad of ["", "   ", "0", "-30", "30.5", "1e2", "abc", "60分"]) {
      expect(parseCustomDuration(bad, 600).ok).toBe(false)
    }
  })
})
