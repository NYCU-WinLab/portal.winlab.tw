/**
 * Capture-time helpers for Memories.
 * Pure parsing lives here so upload + unit tests don't depend on exifr I/O.
 */

const MAX_REASONABLE_TAKEN_MS = Date.UTC(2100, 0, 1)
const MIN_REASONABLE_TAKEN_MS = Date.UTC(1990, 0, 1)

/** Matches Memories / format-uploaded-at — WinLab wall clock, no DST. */
export const EXIF_WALL_TIMEZONE = "Asia/Taipei"

const EXIF_LOCAL_RE =
  /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/

export type ExifDateFields = {
  DateTimeOriginal?: unknown
  CreateDate?: unknown
  DateTimeDigitized?: unknown
  ModifyDate?: unknown
}

/**
 * EXIF timestamps rarely carry a zone. Treat bare "YYYY:MM:DD HH:MM:SS" as
 * Asia/Taipei wall time so lab memories land on the right calendar day.
 */
function parseExifWallClock(raw: string): Date | null {
  const match = EXIF_LOCAL_RE.exec(raw.trim())
  if (!match) return null
  const year = match[1]!
  const month = match[2]!
  const day = match[3]!
  const hour = match[4] ?? "12"
  const minute = match[5] ?? "00"
  const second = match[6] ?? "00"
  // Fixed +08:00 matches Asia/Taipei (no DST).
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function withinReasonableRange(date: Date): boolean {
  const ms = date.getTime()
  return ms >= MIN_REASONABLE_TAKEN_MS && ms <= MAX_REASONABLE_TAKEN_MS
}

/** Turn an EXIF date candidate into an ISO timestamptz string, or null. */
export function normalizeTakenAtCandidate(value: unknown): string | null {
  if (value == null) return null

  let date: Date | null = null
  if (value instanceof Date) {
    date = value
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(value)
  } else if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    // Real ISO with an explicit zone must not be reinterpreted as Taipei.
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      const parsed = new Date(trimmed)
      date = Number.isNaN(parsed.getTime()) ? null : parsed
    } else {
      date = parseExifWallClock(trimmed)
      if (!date) {
        const fallback = new Date(trimmed)
        date = Number.isNaN(fallback.getTime()) ? null : fallback
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null
  if (!withinReasonableRange(date)) return null
  return date.toISOString()
}

/** Prefer capture time, then digitize/create, then modify. */
export function resolveTakenAtFromExifFields(
  fields: ExifDateFields | null | undefined
): string | null {
  if (!fields) return null
  const candidates = [
    fields.DateTimeOriginal,
    fields.CreateDate,
    fields.DateTimeDigitized,
    fields.ModifyDate,
  ]
  for (const candidate of candidates) {
    const iso = normalizeTakenAtCandidate(candidate)
    if (iso) return iso
  }
  return null
}

/**
 * Validate a client-supplied taken_at before insert.
 * Rejects garbage / future-far / pre-digital nonsense.
 */
export function sanitizeClientTakenAt(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null
  if (typeof raw !== "string") return null
  return normalizeTakenAtCandidate(raw.trim())
}
