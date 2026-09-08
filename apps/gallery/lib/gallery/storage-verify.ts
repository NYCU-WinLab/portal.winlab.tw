/**
 * Pure helpers for post-upload existence checks.
 *
 * Mobile uploads often race Storage listing: the object is written but a
 * folder `list(..., { limit: 1000 })` misses it (eventual consistency, or
 * the folder already has ≥1000 objects). Prefer path-scoped checks and
 * exponential backoff instead.
 */

export type VerifyAttemptPlan = {
  attempts: number
  /** Delay before attempt `i` (0-based), in ms. */
  delayBeforeMs: (attemptIndex: number) => number
}

export const DEFAULT_VERIFY_PLAN: VerifyAttemptPlan = {
  attempts: 10,
  delayBeforeMs: (i) => {
    if (i === 0) return 0
    // 150, 300, 450, … capped — mobile listing lag can exceed 1s.
    return Math.min(150 * i, 900)
  },
}

export function objectNamesFromPaths(
  paths: string[],
  userId: string
): string[] {
  const prefix = `${userId}/`
  return paths.map((path) =>
    path.startsWith(prefix) ? path.slice(prefix.length) : path
  )
}

/** True when every expected name appears in the listed names. */
export function allObjectNamesPresent(
  expectedNames: string[],
  listedNames: string[]
): boolean {
  if (expectedNames.length === 0) return false
  const present = new Set(listedNames)
  return expectedNames.every((name) => present.has(name))
}

/**
 * Build list() options that search for one exact object name under the
 * caller's folder — avoids the ≥1000-object blind spot of a bare list.
 */
export function storageSearchOptions(objectName: string): {
  limit: number
  search: string
} {
  return { limit: 20, search: objectName }
}
