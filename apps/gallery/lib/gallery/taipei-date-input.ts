import { galleryTaipeiCalendarDay } from "@/lib/gallery/memories"

/** Format an ISO instant as `YYYY-MM-DD` in Asia/Taipei for `<input type="date">`. */
export function toTaipeiDateInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const day = galleryTaipeiCalendarDay(date)
  const month = String(day.month).padStart(2, "0")
  const datePart = String(day.day).padStart(2, "0")
  return `${day.year}-${month}-${datePart}`
}

/** Parse a date-input value as noon Taipei so Memories day matches the picker. */
export function fromTaipeiDateInput(value: string): string {
  return `${value.trim()}T12:00:00+08:00`
}
