import { format } from "date-fns"

export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

export function formatLeaveDate(isoDate: string): string {
  return format(parseLocalDate(isoDate), "yyyy/MM/dd")
}

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function getNextMondays(count: number, from: Date = new Date()): Date[] {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const dow = base.getDay()
  const offset = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow
  const firstMonday = new Date(base)
  firstMonday.setDate(base.getDate() + offset)

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(firstMonday)
    d.setDate(firstMonday.getDate() + i * 7)
    return d
  })
}

// Taiwan has no DST and sits at a fixed UTC+8, so shifting the epoch by 8h and
// reading the UTC parts gives the Taipei calendar date on any server timezone.
export function taipeiToday(now: Date = new Date()): string {
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = taipei.getUTCFullYear()
  const month = String(taipei.getUTCMonth() + 1).padStart(2, "0")
  const day = String(taipei.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Date-only values carry no timezone, so the weekday is read in UTC — reading
// it locally would move the day for anyone west of Greenwich.
export function isMondayIsoDate(isoDate: string): boolean {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1
}

// The sign-up dialog offers the next LEAVE_MONDAY_OPTIONS Mondays, today
// included when today is one. Anything outside that window cannot be picked on
// the web, so a tool must not accept it either.
export const LEAVE_MONDAY_OPTIONS = 8

export function upcomingLeaveMondays(today: string = taipeiToday()): string[] {
  const start = new Date(`${today}T00:00:00Z`)
  const dow = start.getUTCDay()
  const offset = dow === 1 ? 0 : (8 - dow) % 7
  return Array.from({ length: LEAVE_MONDAY_OPTIONS }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + offset + i * 7)
    return d.toISOString().slice(0, 10)
  })
}
