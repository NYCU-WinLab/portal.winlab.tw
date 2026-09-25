import { describe, expect, test } from "bun:test"

import {
  addMinutesToClock,
  validateBookingTimes,
  validateRecurringSchedule,
} from "@/lib/rooms/booking-times"
import { DAY_WINDOW } from "@/lib/rooms/fetch"

const check = (start: unknown, end: unknown) =>
  validateBookingTimes(start, end, DAY_WINDOW)

const badFormat = { ok: false, error: "時間格式要是 HH:MM" }
const offGrid = { ok: false, error: "時間要對齊 30 分鐘的時段" }
const outside = { ok: false, error: "超出可借的時段(08:00–22:00)" }
const notAfter = { ok: false, error: "結束時間要晚於開始時間" }

describe("validateBookingTimes", () => {
  test("accepts a normal range on the grid", () => {
    expect(check("09:00", "10:30")).toEqual({ ok: true })
  })

  test("accepts the first slot, the last slot, and the whole day", () => {
    expect(check("08:00", "08:30")).toEqual({ ok: true })
    expect(check("21:30", "22:00")).toEqual({ ok: true })
    expect(check("08:00", "22:00")).toEqual({ ok: true })
  })

  test.each(["7:00", "07:0", "ab:cd", "24:00", "09:00:00", "", " 09:00"])(
    "rejects a malformed time %p",
    (bad) => {
      expect(check(bad, "10:00")).toEqual(badFormat)
      expect(check("09:00", bad)).toEqual(badFormat)
    }
  )

  test("rejects a time that isn't a string", () => {
    expect(check(900, "10:00")).toEqual(badFormat)
    expect(check("09:00", null)).toEqual(badFormat)
    expect(check(undefined, undefined)).toEqual(badFormat)
  })

  test("rejects a time off the 30-minute grid", () => {
    expect(check("09:15", "10:00")).toEqual(offGrid)
    expect(check("09:00", "10:45")).toEqual(offGrid)
  })

  test("rejects a range outside the bookable window", () => {
    expect(check("07:30", "09:00")).toEqual(outside)
    expect(check("21:30", "22:30")).toEqual(outside)
    expect(check("22:00", "22:30")).toEqual(outside)
    expect(check("00:00", "01:00")).toEqual(outside)
  })

  test("rejects an end equal to the start", () => {
    expect(check("10:00", "10:00")).toEqual(notAfter)
  })

  test("rejects an end before the start", () => {
    expect(check("11:00", "10:00")).toEqual(notAfter)
  })

  test("follows the window it is given", () => {
    const window = { startHour: 9, endHour: 18, slotMinutes: 30 }
    expect(validateBookingTimes("08:30", "09:30", window).ok).toBe(false)
    expect(validateBookingTimes("17:30", "18:00", window)).toEqual({
      ok: true,
    })

    const hourly = { startHour: 9, endHour: 18, slotMinutes: 60 }
    expect(validateBookingTimes("09:30", "10:00", hourly)).toEqual({
      ok: false,
      error: "時間要對齊 60 分鐘的時段",
    })
    expect(validateBookingTimes("09:00", "10:00", hourly)).toEqual({
      ok: true,
    })
  })
})

describe("addMinutesToClock", () => {
  test("adds across the hour", () => {
    expect(addMinutesToClock("09:00", 60)).toBe("10:00")
    expect(addMinutesToClock("21:30", 30)).toBe("22:00")
    expect(addMinutesToClock("09:45", 30)).toBe("10:15")
    expect(addMinutesToClock("08:00", 0)).toBe("08:00")
  })

  test("returns null instead of wrapping past midnight", () => {
    expect(addMinutesToClock("23:30", 30)).toBeNull()
    expect(addMinutesToClock("22:00", 180)).toBeNull()
    expect(addMinutesToClock("23:59", 0)).toBe("23:59")
  })

  test("returns null for malformed input", () => {
    for (const bad of ["9:00", "24:00", "09:60", "", null, undefined, 900]) {
      expect(addMinutesToClock(bad, 30)).toBeNull()
    }
    for (const bad of [-30, 30.5, Number.NaN, Infinity, "30", null]) {
      expect(addMinutesToClock("09:00", bad)).toBeNull()
    }
  })
})

describe("validateRecurringSchedule", () => {
  const base = {
    weekday: 1,
    startTime: "09:00",
    durationMinutes: 60,
    intervalWeeks: 1,
  }
  const check = (patch: Partial<Record<keyof typeof base, unknown>>) =>
    validateRecurringSchedule({ ...base, ...patch }, DAY_WINDOW)

  test("accepts what the form offers", () => {
    expect(check({})).toEqual({ ok: true })
    expect(check({ weekday: 0 })).toEqual({ ok: true })
    expect(check({ weekday: 6, intervalWeeks: 2 })).toEqual({ ok: true })
    expect(check({ startTime: "21:30", durationMinutes: 30 })).toEqual({
      ok: true,
    })
    expect(check({ startTime: "19:00", durationMinutes: 180 })).toEqual({
      ok: true,
    })
  })

  test("rejects a series that runs past the day's window", () => {
    expect(check({ startTime: "21:30", durationMinutes: 180 }).ok).toBe(false)
    expect(check({ startTime: "21:30", durationMinutes: 60 }).ok).toBe(false)
    // Past midnight, not merely past 22:00.
    expect(check({ startTime: "21:30", durationMinutes: 300 }).ok).toBe(false)
  })

  test("rejects a start before the window or off the grid", () => {
    expect(check({ startTime: "07:30" }).ok).toBe(false)
    expect(check({ startTime: "09:15" }).ok).toBe(false)
    expect(check({ durationMinutes: 45 }).ok).toBe(false)
    expect(check({ startTime: "9:00" }).ok).toBe(false)
  })

  test("weekday is an integer 0 (Sunday) to 6 (Saturday)", () => {
    for (const bad of [-1, 7, 1.5, "1", null]) {
      expect(check({ weekday: bad })).toEqual({
        ok: false,
        error: "星期不正確",
      })
    }
  })

  test("interval is weekly or fortnightly only", () => {
    for (const bad of [0, 3, -1, 1.5, "2", null]) {
      expect(check({ intervalWeeks: bad })).toEqual({
        ok: false,
        error: "頻率只能是每週或隔週",
      })
    }
  })

  test("duration must be a positive integer", () => {
    for (const bad of [0, -60, 60.5, "60", null]) {
      expect(check({ durationMinutes: bad }).ok).toBe(false)
    }
  })
})
