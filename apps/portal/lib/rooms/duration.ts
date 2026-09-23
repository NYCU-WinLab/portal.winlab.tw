// Booking durations — the preset badges and the rules for a custom length.
// Pure, no React, unit-testable.
//
// Everything here is in whole minutes on the 30-minute availability grid.
// The DB and the department system would accept any length, but the grid is
// what everyone else sees: a 45-minute booking would leave its second slot
// half-taken while still drawn as free, and the clash would only surface at
// `findConflict`. So a custom length is still a multiple of the slot (#396).

/** Granularity of the availability grid, and of every bookable duration. */
export const SLOT_MINUTES = 30

/** The one-tap durations offered next to the custom input. */
export const DURATION_PRESETS = [
  { minutes: 30, label: "30 分" },
  { minutes: 60, label: "1 hr" },
  { minutes: 90, label: "1.5 hr" },
  { minutes: 120, label: "2 hr" },
  { minutes: 150, label: "2.5 hr" },
  { minutes: 180, label: "3 hr" },
] as const

/** Just the minutes, for pickers that label them their own way. */
export const DURATION_PRESET_MINUTES: readonly number[] = DURATION_PRESETS.map(
  (p) => p.minutes
)

/**
 * The longest booking that fits between `daySlots[startIndex]` and the end
 * of the day's grid. Past that, `suggestRoom` has no slots to check and
 * returns null, which the UI would misreport as "no room is free".
 */
export function maxDurationMinutes(
  slotCount: number,
  startIndex: number
): number {
  return Math.max(0, slotCount - startIndex) * SLOT_MINUTES
}

export type CustomDurationResult =
  | { ok: true; minutes: number }
  | { ok: false; error: string }

/**
 * Parses what someone typed into the custom-duration box. Accepts a whole
 * number of minutes that is a positive multiple of `SLOT_MINUTES` and no
 * longer than `maxMinutes` (the time left in the day from the chosen start).
 */
export function parseCustomDuration(
  input: string,
  maxMinutes: number
): CustomDurationResult {
  const trimmed = input.trim()
  if (trimmed === "") return { ok: false, error: "請輸入分鐘數" }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "請輸入整數分鐘" }
  }
  const minutes = Number(trimmed)
  if (minutes <= 0) return { ok: false, error: "時長要大於 0" }
  if (minutes % SLOT_MINUTES !== 0) {
    return { ok: false, error: `時長要是 ${SLOT_MINUTES} 分鐘的倍數` }
  }
  if (minutes > maxMinutes) {
    return {
      ok: false,
      error:
        maxMinutes > 0
          ? `超過當天可借的時間,從這個時段起最多 ${maxMinutes} 分鐘`
          : "這個時段之後已經沒有可借的時間",
    }
  }
  return { ok: true, minutes }
}
