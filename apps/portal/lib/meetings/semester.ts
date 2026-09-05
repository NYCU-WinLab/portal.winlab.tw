// Which semester a date falls in — the client-side mirror of the SQL pair
// public.meeting_academic_year / public.meeting_term
// (supabase/migrations/20260828120000_meeting-semesters.sql).
//
// KEEP THE TWO IN SYNC. The database is the authority: it stamps semester_id at
// generation and inherits it on insert, and this function is never allowed to
// decide what a stored row belongs to. It exists for one job — telling the
// generate dialog which semester a not-yet-generated start date WILL open, so
// the preview can show the same skips the RPC will apply.
//
// ROC academic year with an AUGUST boundary: teaching starts in September, so
// August onward belongs to the year just beginning, and January — the tail of
// 上學期 — still belongs to the year before.

export interface SemesterKey {
  /** ROC academic year, e.g. 114. */
  academicYear: number
  /** 1 = 上學期 (months 8–12 and 1), 2 = 下學期 (months 2–7). */
  term: 1 | 2
}

/**
 * `dateStr` is an ISO `YYYY-MM-DD`. Parsed by splitting the string rather than
 * through `new Date()`, which reads a bare date as UTC midnight and lands on the
 * previous day west of UTC — a one-day shift is enough to flip the term on
 * 1 August or 1 February.
 */
export function semesterKeyForDate(dateStr: string): SemesterKey {
  const [y, m] = dateStr.split("-")
  const year = Number(y)
  const month = Number(m)

  const academicYear = year - 1911 - (month < 8 ? 1 : 0)
  const term = month >= 8 || month === 1 ? 1 : 2
  return { academicYear, term }
}

/**
 * Which academic year the presenter roster's tier grade labels (`碩二`, …)
 * should be computed against — "current" meaning the latest semester that
 * has already started, not the latest by start_date. Those diverge the
 * moment next year's semester row exists (an admin routinely creates it
 * months ahead): `semesters.at(-1)` would then report next year's
 * academicYear while the lab is still living in the current one.
 *
 * `today` must be a `YYYY-MM-DD` string already resolved to the lab's
 * timezone (Asia/Taipei) — this function does no clock reads of its own, so
 * it stays pure and the caller controls when "now" is sampled.
 *
 * Falls back to the newest semester when none has started yet, so a
 * database seeded with future-only semesters still labels something.
 * `semesters` is assumed sorted ascending by startDate, same as
 * useSemesters()'s query order.
 */
export function currentAcademicYear(
  semesters: { academicYear: number; startDate: string }[],
  today: string
): number | null {
  const started = semesters.filter((s) => s.startDate <= today)
  return (started.at(-1) ?? semesters.at(-1))?.academicYear ?? null
}
