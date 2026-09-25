// Server-side check of a booking's start and end times. Pure, no React.
//
// The picker only ever offers slots on the grid inside the day's window, but
// a server action receives whatever the request carries, and nothing below it
// (`findConflict`, the plain text columns in `rooms_bookings`) enforces the
// same rules. This is where they are restated for the server.

import type { AvailabilityOptions } from "@/lib/rooms/availability"

export type BookingTimesResult = { ok: true } | { ok: false; error: string }

/** Minutes since midnight for a strict `HH:MM` (00:00–23:59), else null. */
function parseClock(time: unknown): number | null {
  if (typeof time !== "string") return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

// Window bounds are whole hours (`startHour` / `endHour`), so this prints `HH:00`.
function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

/**
 * Accepts `startTime`–`endTime` only when both are `HH:MM`, both sit on the
 * `window.slotMinutes` grid, both fall inside `window` (the end may equal the
 * window's closing hour), and the end is after the start.
 *
 * Takes `unknown` because the caller is a server action: the declared type
 * says string, the request body may not.
 */
export function validateBookingTimes(
  startTime: unknown,
  endTime: unknown,
  window: AvailabilityOptions
): BookingTimesResult {
  const start = parseClock(startTime)
  const end = parseClock(endTime)
  if (start === null || end === null) {
    return { ok: false, error: "時間格式要是 HH:MM" }
  }
  const slot = window.slotMinutes
  if (start % slot !== 0 || end % slot !== 0) {
    return { ok: false, error: `時間要對齊 ${slot} 分鐘的時段` }
  }
  if (start < window.startHour * 60 || end > window.endHour * 60) {
    return {
      ok: false,
      error: `超出可借的時段(${formatHour(window.startHour)}–${formatHour(window.endHour)})`,
    }
  }
  if (end <= start) return { ok: false, error: "結束時間要晚於開始時間" }
  return { ok: true }
}

/**
 * `HH:MM` plus a whole number of minutes, as the `HH:MM` it ends at. Null for
 * anything that isn't a strict `HH:MM` and a non-negative integer, and for a
 * result past 23:59 — a meeting that ends tomorrow is not one the day's grid
 * can hold, and wrapping it round to `00:30` would pass for valid.
 */
export function addMinutesToClock(
  time: unknown,
  minutes: unknown
): string | null {
  const start = parseClock(time)
  if (start === null) return null
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) return null
  if (minutes < 0) return null
  const total = start + minutes
  if (total >= 24 * 60) return null
  const hh = String(Math.floor(total / 60)).padStart(2, "0")
  const mm = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/** Longest cadence the recurring form offers: 每週 (1) or 隔週 (2). */
export const MAX_INTERVAL_WEEKS = 2

export interface RecurringScheduleInput {
  weekday: unknown
  startTime: unknown
  durationMinutes: unknown
  intervalWeeks: unknown
}

function isIntegerIn(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  )
}

/**
 * Server-side check of a standing meeting's schedule, before it is stored.
 *
 * Without it a series that starts off the grid, or runs past the day's
 * window, is saved happily and only fails in the nightly run — a week later,
 * long after the person who made it has left the page (#1233).
 *
 * `weekday` is 0 = Sunday … 6 = Saturday, as `RecurrenceRule` and
 * `Date#getUTCDay()` read it.
 */
export function validateRecurringSchedule(
  input: RecurringScheduleInput,
  window: AvailabilityOptions
): BookingTimesResult {
  const { weekday, startTime, durationMinutes, intervalWeeks } = input
  if (!isIntegerIn(weekday, 0, 6)) {
    return { ok: false, error: "星期不正確" }
  }
  if (!isIntegerIn(intervalWeeks, 1, MAX_INTERVAL_WEEKS)) {
    return { ok: false, error: "頻率只能是每週或隔週" }
  }
  if (!isIntegerIn(durationMinutes, 1, 24 * 60)) {
    return { ok: false, error: "時長要是正整數分鐘" }
  }
  if (parseClock(startTime) === null) {
    return { ok: false, error: "時間格式要是 HH:MM" }
  }
  const endTime = addMinutesToClock(startTime, durationMinutes)
  if (endTime === null) {
    return {
      ok: false,
      error: `超出可借的時段(${formatHour(window.startHour)}–${formatHour(window.endHour)})`,
    }
  }
  return validateBookingTimes(startTime, endTime, window)
}
