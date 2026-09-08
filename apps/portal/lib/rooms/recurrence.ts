// Does a standing meeting fall on a given date?
//
// Pure and separately tested because the fortnightly case is where this
// silently goes wrong: an off-by-one in the phase books every meeting on the
// wrong week, and the only symptom is a room reserved seven days early.

export interface RecurrenceRule {
  /** 0 = Sunday, matching Date#getDay(). */
  weekday: number
  /** 1 = weekly, 2 = fortnightly. */
  intervalWeeks: number
  /** A date the series is known to land on, as YYYY-MM-DD. */
  anchorDate: string
}

const MS_PER_DAY = 86_400_000

// These dates are already Asia/Taipei calendar days — the string *is* the
// answer. Parsing them at UTC midnight keeps the arithmetic on whole days;
// attaching +08:00 and then reading a UTC field shifts back across the date
// line and returns the previous day's weekday.
function atUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

/** Weekday of a YYYY-MM-DD Asia/Taipei calendar day. */
export function weekdayOf(dateStr: string): number {
  return atUtcMidnight(dateStr).getUTCDay()
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (atUtcMidnight(to).getTime() - atUtcMidnight(from).getTime()) / MS_PER_DAY
  )
}

export function occursOn(rule: RecurrenceRule, dateStr: string): boolean {
  if (weekdayOf(dateStr) !== rule.weekday) return false
  if (rule.intervalWeeks === 1) return true

  // Whole weeks from the anchor, floored toward negative infinity so dates
  // before the anchor keep the same alternation rather than flipping phase.
  const weeks = Math.floor(daysBetween(rule.anchorDate, dateStr) / 7)
  return weeks % rule.intervalWeeks === 0
}

/** "HH:mm" plus a duration, as the "HH:mm" it ends at. */
export function endTimeOf(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + durationMinutes
  const hh = String(Math.floor(total / 60)).padStart(2, "0")
  const mm = String(total % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * The first date on or after `from` that this series actually meets on.
 *
 * Walks day by day rather than jumping to the next matching weekday: for a
 * fortnightly series the right answer is the next *in-phase* week, and the
 * phase is what `occursOn` knows. Bounded at 8 weeks — two intervals of the
 * longest cadence the form offers — so a rule that somehow matches nothing
 * returns null instead of looping.
 */
export function nextOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  from: string
): string | null {
  for (let i = 0; i < 56; i++) {
    const date = shiftDays(from, i)
    if (occursOn(rule, date)) return date
  }
  return null
}

/** Every date this series meets on within `[from, to]`, inclusive. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: string,
  to: string
): string[] {
  const span = daysBetween(from, to)
  if (span < 0) return []

  const dates: string[] = []
  for (let i = 0; i <= span; i++) {
    const date = shiftDays(from, i)
    if (occursOn(rule, date)) dates.push(date)
  }
  return dates
}

function shiftDays(from: string, days: number): string {
  return new Date(atUtcMidnight(from).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}

/** The first date on or after `from` that falls on `weekday`. */
export function nextWeekdayOnOrAfter(from: string, weekday: number): string {
  const start = atUtcMidnight(from)
  const shift = (weekday - start.getUTCDay() + 7) % 7
  return new Date(start.getTime() + shift * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}
