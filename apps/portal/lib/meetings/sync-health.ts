import { EXCLUDED_USERNAMES } from "./lab-status"
import type { LabStatus, LabStatusRow } from "./lab-status"

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
 * The cron runs daily (`45 4 * * *` in vercel.json — UTC, so 12:45 Taipei), so
 * a run dated yesterday is normal and one dated the day before means two
 * consecutive misses. Measured in Asia/Taipei calendar days, not elapsed hours:
 * an admin looking at this at 09:00 wants to know which DAY it last ran.
 */
const STALE_FROM_DAYS_AGO = 2

/** `YYYY-MM-DD` in Asia/Taipei — the same pin used across this app's date logic. */
function taipeiDay(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d)
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  )
}

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

  // Calendar days, not elapsed 24-hour periods. Elapsed time would call a run
  // from yesterday lunchtime "0 days" all of this morning, and the panel prints
  // 0 as 今天 — a claim about the calendar, which has to be made on the
  // calendar the lab lives in.
  const days = calendarDaysBetween(taipeiDay(then), taipeiDay(now))
  // Clock skew, or a run stamped slightly ahead, is not staleness.
  const clamped = Math.max(days, 0)
  return {
    level: clamped >= STALE_FROM_DAYS_AGO ? "stale" : "fresh",
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

/**
 * Members Keycloak used to know about and has now stopped matching.
 *
 * This list is not a nicety — it is the compensating control for the decision
 * to exclude NULL `lab_status` from scheduling. A member who renames themselves
 * in Keycloak stops matching on `username` (the portal only refreshes that at
 * login), the next nightly sync writes NULL, and they drop out of the presenter
 * roster and the questioner rotation with no error anywhere. One rename is one
 * changed row, far under checkLabStatusUpdatePlan's floors, so the blast-radius
 * guard will not catch it either. Nothing else in the system says it happened.
 *
 * WHY `lastSyncedAt` IS THE FILTER AND NOT JUST "labStatus is null".
 *
 * NULL is the resting state of a large part of user_profiles, not an anomaly:
 * faculty, admin staff, people who left the realm years ago, and pre-Keycloak
 * shell accounts that were never signed into all sit there permanently (see
 * use-lab-users.ts's doc comment for the same list). Showing all of them would
 * put "37 位成員沒有身分資料" on screen from day one, and an admin who
 * recognises nobody in a list learns to stop opening it — burying the one name
 * that means something. A non-null `lab_status_synced_at` says the sync DID
 * match this person once, so a NULL beside it is a person who has dropped out
 * rather than one who was never in.
 *
 * Accounts with no username, or a known non-human one, are excluded outright:
 * they can never be matched, so they can never be this.
 */
export function unsyncedMembers<
  T extends LabStatusRow & { lastSyncedAt: string | null },
>(profiles: T[]): T[] {
  return profiles.filter(
    (p) =>
      p.labStatus === null &&
      p.lastSyncedAt !== null &&
      p.username !== null &&
      p.username.length > 0 &&
      !EXCLUDED_USERNAMES.has(p.username)
  )
}
