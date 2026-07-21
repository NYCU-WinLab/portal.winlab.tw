import type { Meeting } from "./types"

/**
 * The "current" meeting is the nearest upcoming non-holiday session, with
 * today counting as upcoming. `meetings` is expected sorted ascending by
 * `scheduledDate` (as returned by `useMeetings`). Returns `null` when every
 * session is in the past.
 */
export function getCurrentMeetingId(
  meetings: Meeting[],
  now: Date = new Date()
): string | null {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  for (const m of meetings) {
    if (m.isHoliday) continue
    if (new Date(m.scheduledDate) >= today) return m.id
  }
  return null
}
