// The shape GitLab reads every 30 minutes to maintain its marker comments.
//
// Two decisions are load-bearing and both came from the consumer side.
//
// 1. A row leaving the response means nothing. It could be cancelled, or
//    finished, or the endpoint could be having a bad day — three different
//    situations that all look like absence. So the window is explicit
//    (`from`/`to`) and cancelled bookings stay in it, carrying a status.
//    Nothing downstream ever has to infer from a gap.
//
// 2. `join_url` is Portal's redirect, not the Teams link. The Teams meeting
//    doesn't exist for the first minutes after a booking, so a poller would
//    otherwise see null on its first pass and have to rewrite the comment
//    later. The redirect is valid immediately and resolves once there's
//    something to resolve to.

/** How far the window may span, so a missing bound can't scan everything. */
export const MAX_WINDOW_DAYS = 90
const DEFAULT_WINDOW_DAYS = 30

export type BookingFeedStatus = "confirmed" | "cancelled"

export interface BookingFeedItem {
  booking_id: string
  /** ISO 8601 with the +08:00 offset these meetings are actually in. */
  start: string
  end: string
  /** Null for an online-only meeting, which reserves no room. */
  room: string | null
  title: string | null
  status: BookingFeedStatus
  /** Null when this booking never asked for a Teams meeting. */
  join_url: string | null
  issue_refs: string[]
  /**
   * Repeated from the trigger on purpose. If the trigger's copy was lost,
   * the next poll picks these up from here — same reason `status` exists.
   */
  group_name: string | null
  agenda: string | null
}

export interface FeedWindow {
  from: string
  to: string
}

/** `2026-08-18T09:30:00+08:00` — self-describing for a human reading it. */
export function taipeiOffsetIso(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}+08:00`
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Resolves the requested window, or explains why it can't be.
 *
 * Accepts a bare calendar day; a full timestamp is truncated to its date,
 * since bookings are stored as Asia/Taipei calendar days and pretending to
 * honour an instant would be a lie about the granularity.
 */
export function resolveWindow(
  from: string | null,
  to: string | null,
  today: string
): { ok: true; window: FeedWindow } | { ok: false; error: string } {
  const start = (from ?? today).slice(0, 10)
  if (!DATE.test(start)) {
    return { ok: false, error: "from 必須是 YYYY-MM-DD" }
  }

  const end = (to ?? addDays(start, DEFAULT_WINDOW_DAYS)).slice(0, 10)
  if (!DATE.test(end)) {
    return { ok: false, error: "to 必須是 YYYY-MM-DD" }
  }

  if (end < start) {
    return { ok: false, error: "to 不能早於 from" }
  }

  const span =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
    86_400_000
  if (span > MAX_WINDOW_DAYS) {
    return { ok: false, error: `時間窗最多 ${MAX_WINDOW_DAYS} 天` }
  }

  return { ok: true, window: { from: start, to: end } }
}

export interface FeedRow {
  id: string
  date: string
  start_time: string
  end_time: string
  room: string | null
  title: string | null
  status: string
  online: boolean
  issue_refs: string[] | null
  group_name: string | null
  agenda: string | null
}

export function toFeedItem(
  row: FeedRow,
  joinUrlFor: (bookingId: string) => string
): BookingFeedItem {
  return {
    booking_id: row.id,
    start: taipeiOffsetIso(row.date, row.start_time),
    end: taipeiOffsetIso(row.date, row.end_time),
    room: row.room,
    title: row.title,
    // Everything that isn't a live booking reads as cancelled: the consumer's
    // rule is "cancelled -> rewrite the comment", and an unknown status it
    // can't act on would be worse than treating it as gone.
    status: row.status === "booked" ? "confirmed" : "cancelled",
    join_url: row.online ? joinUrlFor(row.id) : null,
    issue_refs: row.issue_refs ?? [],
    group_name: row.group_name,
    agenda: row.agenda,
  }
}
