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
