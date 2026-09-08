// Picking the right recording out of a NextCloud folder listing.
//
// Two naming conventions live in the same folder and both have to keep
// working:
//
//   2026-06-22 Hermes Agent - ….mp4      the lab's own since 2023
//   [tasa-satsim] 2026-08-18 週會.mp4     what the sharepoint bridge writes
//
// Matching on the date alone was fine while every recording came from the
// weekly seminar. Now that room bookings carry a project prefix, two meetings
// on the same day both contain that date — and whichever the listing happened
// to return first won.

/** `[prefix] rest` or `[prefix]-rest`, per the bridge's convention. */
const PREFIXED = /^\[([^\]]+)\][\s-]/

export interface RecordingFile {
  filename: string
  /** Whatever the caller needs back once a file is chosen. */
  href: string
  fileId: string | null
}

export interface RecordingMatch extends RecordingFile {
  /** Null for the legacy naming, which carries no project. */
  prefix: string | null
}

/** The project prefix a recording filename declares, if any. */
export function recordingPrefix(filename: string): string | null {
  return PREFIXED.exec(filename)?.[1]?.trim() ?? null
}

/**
 * Both spellings of a calendar day that show up in these filenames.
 *
 * The bridge derives the date in +08:00 before formatting, so a 07:00 meeting
 * and a New Year's Eve meeting land on the day people would call them.
 */
function dateVariants(date: string): string[] {
  return [date, date.replace(/-/g, "")]
}

/**
 * The recording for one meeting, or null.
 *
 * @param prefix the booking's project prefix. When given, only that project's
 *   recordings qualify — this is what stops two meetings on one day from
 *   picking each other's video.
 *
 *   When absent (the weekly seminar, which has no project), unprefixed files
 *   are preferred and prefixed ones are only considered if nothing else
 *   matches. Without that preference the seminar would start claiming a room
 *   booking's recording the first day the two collide.
 */
export function pickRecording(
  files: RecordingFile[],
  { date, prefix }: { date: string; prefix?: string | null }
): RecordingMatch | null {
  const variants = dateVariants(date)
  const onDate: RecordingMatch[] = files
    .filter((f) => variants.some((v) => f.filename.includes(v)))
    .map((f) => ({ ...f, prefix: recordingPrefix(f.filename) }))

  if (onDate.length === 0) return null

  if (prefix) {
    return onDate.find((f) => f.prefix === prefix) ?? null
  }

  return onDate.find((f) => f.prefix === null) ?? onDate[0] ?? null
}
