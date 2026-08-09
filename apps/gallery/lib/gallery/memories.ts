/** Lab-local calendar for Memories ("On this day"). */
export const GALLERY_MEMORIES_TIMEZONE = "Asia/Taipei"

export const GALLERY_MEMORIES_LIMIT_DEFAULT = 100
export const GALLERY_MEMORIES_LIMIT_MAX = 200

export type GalleryMemoryPhoto = {
  id: string
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
  created_by: string | null
  created_at: string
  taken_at: string
  sequence_id: string | null
  sequence_index: number | null
  memory_year: number
  uploader_name: string
}

export type GalleryMemoryYearGroup = {
  year: number
  photos: GalleryMemoryPhoto[]
}

export type GalleryCalendarDay = {
  month: number
  day: number
  year: number
}

/** Parts of an Instant in Asia/Taipei (1-indexed month/day). */
export function galleryTaipeiCalendarDay(
  instant: Date = new Date()
): GalleryCalendarDay {
  if (Number.isNaN(instant.getTime())) {
    return galleryTaipeiCalendarDay(new Date())
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GALLERY_MEMORIES_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant)

  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  const day = Number(parts.find((p) => p.type === "day")?.value)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error("Could not resolve Taipei calendar day")
  }

  return { year, month, day }
}

export function isValidGalleryCalendarDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  // Reject impossible dates (Feb 30, Apr 31, …) using a non-leap probe year.
  // Feb 29 is allowed — leap-year memories still match on that calendar day.
  if (month === 2 && day > 29) return false
  if ([4, 6, 9, 11].includes(month) && day > 30) return false
  return true
}

export function clampGalleryMemoriesLimit(
  raw: number | null | undefined
): number {
  if (raw == null || !Number.isFinite(raw))
    return GALLERY_MEMORIES_LIMIT_DEFAULT
  const n = Math.trunc(raw)
  if (n < 1) return 1
  if (n > GALLERY_MEMORIES_LIMIT_MAX) return GALLERY_MEMORIES_LIMIT_MAX
  return n
}

/** Parse `?month=` / `?day=` from the memories route; fall back to today. */
export function resolveMemoriesCalendarDay(input: {
  month?: string | null
  day?: string | null
  now?: Date
}): GalleryCalendarDay {
  const today = galleryTaipeiCalendarDay(input.now ?? new Date())
  const month = Number.parseInt(input.month ?? "", 10)
  const day = Number.parseInt(input.day ?? "", 10)
  if (isValidGalleryCalendarDay(month, day)) {
    return { year: today.year, month, day }
  }
  return today
}

export function groupMemoriesByYear(
  photos: GalleryMemoryPhoto[]
): GalleryMemoryYearGroup[] {
  const byYear = new Map<number, GalleryMemoryPhoto[]>()
  for (const photo of photos) {
    const list = byYear.get(photo.memory_year) ?? []
    list.push(photo)
    byYear.set(photo.memory_year, list)
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, yearPhotos]) => ({
      year,
      photos: yearPhotos,
    }))
}

/** English label pinned to Taipei so SSR/CSR match. */
export function formatMemoriesDayLabel(month: number, day: number): string {
  if (!isValidGalleryCalendarDay(month, day)) return ""
  // Use a fixed leap year so Feb 29 formats cleanly.
  const probe = new Date(Date.UTC(2024, month - 1, day, 4, 0, 0))
  return probe.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: GALLERY_MEMORIES_TIMEZONE,
  })
}

export function memoriesYearsAgoLabel(
  memoryYear: number,
  currentYear: number
): string {
  const delta = currentYear - memoryYear
  if (delta <= 0) return String(memoryYear)
  if (delta === 1) return "1 year ago"
  return `${delta} years ago`
}
