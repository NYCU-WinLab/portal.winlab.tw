import { describe, expect, test } from "bun:test"

import {
  DURATION_PRESET_MINUTES,
  DURATION_PRESETS,
  SLOT_MINUTES,
  clampToPreset,
  maxDurationMinutes,
  parseCustomDuration,
} from "./duration"

describe("recurring-form preset bounding", () => {
  // The recurring form's start times: 08:00 … 21:30, one per slot.
  const START_COUNT = 28
  const allowed = (startIndex: number) => {
    const max = maxDurationMinutes(START_COUNT, startIndex)
    return DURATION_PRESET_MINUTES.filter((m) => m <= max)
  }

  test("a 21:30 start only allows 30 minutes", () => {
    expect(allowed(27)).toEqual([30])
  })

  test("a 20:00 start allows up to 2 hours", () => {
    expect(allowed(24)).toEqual([30, 60, 90, 120])
  })

  test("a morning start allows every preset", () => {
    expect(allowed(0)).toEqual([...DURATION_PRESET_MINUTES])
  })
})

describe("clampToPreset", () => {
  test("keeps a duration that still fits", () => {
    expect(clampToPreset(60, 120)).toBe(60)
    expect(clampToPreset(120, 120)).toBe(120)
  })

  test("steps down to the longest preset that fits", () => {
    expect(clampToPreset(180, 30)).toBe(30)
    expect(clampToPreset(180, 120)).toBe(120)
    expect(clampToPreset(150, 100)).toBe(90)
  })

  test("returns null when nothing fits", () => {
    expect(clampToPreset(60, 0)).toBeNull()
  })
})

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

  test("labels are English, plural past one hour", () => {
    expect(DURATION_PRESETS.map((p) => p.label)).toEqual([
      "30 mins",
      "1 hr",
      "1.5 hrs",
      "2 hrs",
      "2.5 hrs",
      "3 hrs",
    ])
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
    expect(parseCustomDuration("30", 0)).toEqual({
      ok: false,
      error: "這個時段之後已經沒有可借的時間",
    })
  })

  test("accepts full-width digits from a Taiwanese IME", () => {
    expect(parseCustomDuration("９０", 600)).toEqual({ ok: true, minutes: 90 })
  })

  test("rejects full-width zero with the positive-duration error", () => {
    expect(parseCustomDuration("０", 600)).toEqual({
      ok: false,
      error: "時長要大於 0",
    })
  })

  test("reads a leading zero as decimal minutes", () => {
    expect(parseCustomDuration("060", 600)).toEqual({ ok: true, minutes: 60 })
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
