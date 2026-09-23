// Server-side check of a booking's start and end times. Pure, no React.
//
// The picker only ever offers slots on the grid inside the day's window, but
// a server action receives whatever the request carries, and nothing below it
// (`findConflict`, the plain text columns in `rooms_bookings`) enforces the
// same rules. This is where they are restated for the server.

import type { AvailabilityOptions } from "@/lib/rooms/availability"
import { SLOT_MINUTES } from "@/lib/rooms/duration"

export type BookingTimesResult = { ok: true } | { ok: false; error: string }

/** Minutes since midnight for a strict `HH:MM` (00:00–23:59), else null. */
function parseClock(time: unknown): number | null {
  if (typeof time !== "string") return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

/**
 * Accepts `startTime`–`endTime` only when both are `HH:MM`, both sit on the
 * `SLOT_MINUTES` grid, both fall inside `window` (the end may equal the
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
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return { ok: false, error: `時間要對齊 ${SLOT_MINUTES} 分鐘的時段` }
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
