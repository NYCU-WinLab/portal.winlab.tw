// Which schedule year /meetings opens on, and how far forward the arrows reach.
//
// `meetings.year` is a schedule BUCKET stamped when a row is created, not the
// calendar year of `scheduled_date`: meetings_generate_semester writes the
// p_year it was handed, meetings_insert_week inherits it from the row it
// shifts, and neither ever recomputes it from the date. A full year of weekly
// slots is 52 × 7 = 364 days, so a schedule that opens in the first week of
// January always spills its last slot into the next calendar year — the 2026
// bucket runs 2026-01-05 through 2027-01-04.
//
// Two things broke because the page assumed bucket == calendar year:
//
//   * `new Date().getFullYear()` as the default meant that on 1 January the page
//     would open a calendar year with no rows, while the next real meeting sat
//     in the previous bucket one click to the left.
//   * capping the forward arrow at the calendar year made next year's bucket
//     unreachable, so an admin could never open it to generate its semester.
//
// Both are answered from the data instead of from the clock.

export interface ScheduleYearBounds {
  /**
   * Bucket holding the earliest non-holiday meeting on or after today, if any.
   * Holiday rows are excluded deliberately: a 元旦 or 月考週 marker is a row but
   * not a meeting, and letting one answer "where is the next meeting" sends the
   * page to a bucket that has nothing to show.
   */
  upcoming: number | null
  /** Highest bucket that has any row at all. */
  latest: number | null
}

/**
 * The year to open when the URL doesn't name one: wherever the next meeting
 * actually lives. Falls back to the last bucket that exists (the schedule has
 * run out), then to the calendar year (empty table — a fresh install).
 */
export function defaultScheduleYear(
  bounds: ScheduleYearBounds,
  calendarYear: number
): number {
  return bounds.upcoming ?? bounds.latest ?? calendarYear
}

/**
 * Furthest year the forward arrow may reach — always one past anything that
 * exists, so an admin can open an empty next year and generate it. Without the
 * +1 the schedule can never be extended past whatever is already there.
 */
export function maxNavigableYear(
  bounds: ScheduleYearBounds,
  calendarYear: number
): number {
  return Math.max(calendarYear, bounds.latest ?? calendarYear) + 1
}
