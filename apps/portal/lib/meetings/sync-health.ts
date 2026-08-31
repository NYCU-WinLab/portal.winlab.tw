import type { LabStatus } from "./lab-status"
import type { LabStatusRow } from "./lab-status"

/**
 * How a sync run ended. Mirrors `lab_status_sync_runs.status`'s CHECK
 * constraint; widening one without the other silently drops rows.
 */
export type SyncRunStatus =
  | "ok"
  | "refused"
  | "forbidden"
  | "unconfigured"
  | "error"

export type SyncRun = {
  ranAt: string
  status: SyncRunStatus
  scanned: number
  changed: number
  detail: string | null
}

export type SyncFreshness = {
  level: "fresh" | "stale" | "never"
  /** Whole days since the last SUCCESSFUL run; null when there has never been one. */
  days: number | null
}

/**
 * The cron runs daily (`45 4 * * *` in vercel.json), so one skipped night is
 * normal operational noise and two is not. Anything older than this is worth
 * a person's attention.
 */
const STALE_AFTER_DAYS = 2

/**
 * Turn "when did the Keycloak sync last succeed" into something a panel can
 * show.
 *
 * The point of measuring this at all: lab_status now decides who gets
 * scheduled, and a sync that stops — a rotated credential, a narrowed client
 * role, a renamed /lab-member subgroup — leaves the last good data in place
 * and looks *exactly* like a quiet week. There is no error to notice and no
 * empty screen. The only difference between healthy and dead is the date.
 *
 * Deliberately takes the last SUCCESSFUL run, not the last run of any kind: a
 * job that has been failing every night for a fortnight is not fresh, however
 * recently it ran.
 */
export function syncFreshness(
  lastSuccessAt: string | null,
  now: Date
): SyncFreshness {
  if (!lastSuccessAt) return { level: "never", days: null }

  const then = new Date(lastSuccessAt)
  if (Number.isNaN(then.getTime())) return { level: "never", days: null }

  const days = Math.floor(
    (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000)
  )
  // A clock skew or a run stamped slightly in the future is not staleness.
  const clamped = Math.max(days, 0)
  return {
    level: clamped > STALE_AFTER_DAYS ? "stale" : "fresh",
    days: clamped,
  }
}

/**
 * The profiles Keycloak actually had something to say about this run.
 *
 * Distinct from {@link planLabStatusUpdates}' output, which is only the rows
 * whose value CHANGED. "Unchanged" and "not seen" are the two facts the old
 * cron could not tell apart, and they are now opposite in consequence: an
 * unchanged member keeps being scheduled, an unseen one is dropped from every
 * roster. Only the former should have its `lab_status_synced_at` stamped.
 */
export function matchedProfileIds(
  profiles: LabStatusRow[],
  fromKeycloak: Map<string, LabStatus>
): string[] {
  return profiles
    .filter((p) => p.username !== null && fromKeycloak.has(p.username))
    .map((p) => p.id)
}
