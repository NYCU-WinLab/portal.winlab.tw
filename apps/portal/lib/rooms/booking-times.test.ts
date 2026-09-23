import { describe, expect, test } from "bun:test"

import { validateBookingTimes } from "@/lib/rooms/booking-times"
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
