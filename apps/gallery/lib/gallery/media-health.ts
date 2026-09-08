/**
 * Pure helpers for the admin broken-media scanner.
 *
 * The wall thumbs via Supabase `/render/image`. A 400 there (object missing,
 * unsupported format, corrupt bytes) leaves a blank polaroid. Classify probe
 * status codes so Manage can list and purge those rows.
 */

export const MEDIA_HEALTH_PAGE_SIZE = 40
export const MEDIA_HEALTH_PROBE_CONCURRENCY = 6

export type MediaHealthIssue =
  | "missing_original"
  | "missing_poster"
  | "unreadable_thumb"
  | "probe_error"

export type ProbeKind = "ok" | "missing" | "unreadable" | "error"

export type MediaHealthScanRow = {
  id: string
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
  created_by: string
  created_at: string
}

export type MediaHealthFinding = MediaHealthScanRow & {
  issues: MediaHealthIssue[]
  displayPath: string
}

export type MediaHealthProbePlan = {
  originalUrl: string
  posterUrl: string | null
  thumbUrl: string
  displayPath: string
}

/** Path the wall actually transforms for the polaroid thumb. */
export function displayPathForRow(row: {
  media_type: "image" | "video"
  image_path: string
  poster_path: string | null
}): string {
  if (row.media_type === "video" && row.poster_path) {
    return row.poster_path
  }
  return row.image_path
}

export function classifyObjectStatus(status: number): ProbeKind {
  if (status >= 200 && status < 300) return "ok"
  if (status === 404 || status === 400) return "missing"
  if (status === 0) return "error"
  return "error"
}

/**
 * Transform endpoint: 400 is the known "can't render this" signal (missing
 * object, HEIC leftovers, corrupt bytes). 404 is the same for admins.
 */
export function classifyThumbStatus(status: number): ProbeKind {
  if (status >= 200 && status < 300) return "ok"
  if (status === 404 || status === 400 || status === 415) return "unreadable"
  if (status === 0) return "error"
  return "error"
}

export function issuesFromProbes(input: {
  mediaType: "image" | "video"
  hasPosterPath: boolean
  original: ProbeKind
  poster: ProbeKind | null
  thumb: ProbeKind
}): MediaHealthIssue[] {
  const issues: MediaHealthIssue[] = []

  if (input.original === "missing") {
    issues.push("missing_original")
  } else if (input.original === "error") {
    issues.push("probe_error")
  }

  if (input.mediaType === "video") {
    if (!input.hasPosterPath || input.poster === "missing") {
      issues.push("missing_poster")
    } else if (input.poster === "error") {
      issues.push("probe_error")
    }
  }

  // Thumb only matters when the display object is present — otherwise the
  // missing_* issues already explain the blank frame.
  const displayMissing =
    input.mediaType === "video"
      ? !input.hasPosterPath || input.poster === "missing"
      : input.original === "missing"

  if (!displayMissing) {
    if (input.thumb === "unreadable") {
      issues.push("unreadable_thumb")
    } else if (input.thumb === "error") {
      issues.push("probe_error")
    }
  }

  return uniqueIssues(issues)
}

function uniqueIssues(issues: MediaHealthIssue[]): MediaHealthIssue[] {
  return [...new Set(issues)]
}

export function buildFinding(
  row: MediaHealthScanRow,
  probes: {
    original: ProbeKind
    poster: ProbeKind | null
    thumb: ProbeKind
  }
): MediaHealthFinding | null {
  const issues = issuesFromProbes({
    mediaType: row.media_type,
    hasPosterPath: Boolean(row.poster_path),
    original: probes.original,
    poster: probes.poster,
    thumb: probes.thumb,
  })
  if (issues.length === 0) return null
  return {
    ...row,
    issues,
    displayPath: displayPathForRow(row),
  }
}

export function summarizeFindings(findings: MediaHealthFinding[]): {
  total: number
  missingOriginal: number
  missingPoster: number
  unreadableThumb: number
  probeError: number
} {
  let missingOriginal = 0
  let missingPoster = 0
  let unreadableThumb = 0
  let probeError = 0
  for (const finding of findings) {
    if (finding.issues.includes("missing_original")) missingOriginal++
    if (finding.issues.includes("missing_poster")) missingPoster++
    if (finding.issues.includes("unreadable_thumb")) unreadableThumb++
    if (finding.issues.includes("probe_error")) probeError++
  }
  return {
    total: findings.length,
    missingOriginal,
    missingPoster,
    unreadableThumb,
    probeError,
  }
}

export function issueLabel(issue: MediaHealthIssue): string {
  switch (issue) {
    case "missing_original":
      return "Missing original"
    case "missing_poster":
      return "Missing poster"
    case "unreadable_thumb":
      return "Unreadable thumb (400)"
    case "probe_error":
      return "Probe failed"
  }
}

/** Run async work over items with a fixed concurrency cap. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.floor(concurrency))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index]!, index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  )
  await Promise.all(workers)
  return results
}
