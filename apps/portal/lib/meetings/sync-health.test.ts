import { describe, expect, test } from "bun:test"

import type { LabStatus, LabStatusRow } from "@/lib/meetings/lab-status"
import {
  matchedProfileIds,
  syncFreshness,
  unsyncedMembers,
} from "@/lib/meetings/sync-health"

const NOW = new Date("2026-08-31T12:00:00+08:00")
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

describe("syncFreshness", () => {
  test("never run", () => {
    expect(syncFreshness(null, NOW)).toEqual({ level: "never", days: null })
  })

  test("a run this morning is fresh", () => {
    expect(syncFreshness(daysAgo(0), NOW)).toEqual({ level: "fresh", days: 0 })
  })

  // One skipped night is normal; the cron is daily, so tolerating exactly two
  // days means a single failure never cries wolf.
  // Counted in Asia/Taipei calendar days: yesterday is one missed run and is
  // still fine, the day before that is two and is not.
  test("yesterday is fresh, the day before is stale", () => {
    expect(syncFreshness(daysAgo(1), NOW)).toEqual({ level: "fresh", days: 1 })
    expect(syncFreshness(daysAgo(2), NOW)).toEqual({ level: "stale", days: 2 })
  })

  // The cron fires at 12:45 Taipei. Seen at 09:00 the next morning that is
  // under 24 hours ago, but it is not 今天 — and 今天 is what the panel prints
  // for 0.
  test("a run from yesterday lunchtime is 1 day, not 0, when read this morning", () => {
    expect(
      syncFreshness(
        "2026-08-30T12:45:00+08:00",
        new Date("2026-08-31T09:00:00+08:00")
      )
    ).toEqual({ level: "fresh", days: 1 })
  })

  test("a timestamp in the future reads as zero days, not negative", () => {
    expect(syncFreshness(daysAgo(-5), NOW)).toEqual({ level: "fresh", days: 0 })
  })

  test("a run later today is still 今天", () => {
    expect(
      syncFreshness(
        "2026-08-31T12:45:00+08:00",
        new Date("2026-08-31T23:00:00+08:00")
      )
    ).toEqual({ level: "fresh", days: 0 })
  })

  test("an unparseable timestamp is treated as never, not as fresh", () => {
    expect(syncFreshness("not a date", NOW).level).toBe("never")
  })
})

describe("matchedProfileIds", () => {
  const profiles: LabStatusRow[] = [
    { id: "a", username: "alice", labStatus: "master" },
    // Seen by Keycloak and unchanged — the case planLabStatusUpdates drops and
    // this function must keep, or an unchanged member reads as never synced.
    { id: "b", username: "bob", labStatus: "master" },
    { id: "c", username: "carol", labStatus: "master" },
    { id: "d", username: null, labStatus: null },
  ]
  const fromKeycloak = new Map<string, LabStatus>([
    ["alice", "doctoral"],
    ["bob", "master"],
  ])

  test("returns everyone Keycloak knew about, changed or not", () => {
    expect(matchedProfileIds(profiles, fromKeycloak)).toEqual(["a", "b"])
  })

  test("a profile Keycloak no longer knows about is not stamped", () => {
    expect(matchedProfileIds(profiles, fromKeycloak)).not.toContain("c")
  })

  test("a profile with no username cannot be matched", () => {
    expect(matchedProfileIds(profiles, fromKeycloak)).not.toContain("d")
  })
})

describe("unsyncedMembers", () => {
  const SEEN = "2026-08-20T04:45:00Z"
  const rows: (LabStatusRow & { lastSyncedAt: string | null })[] = [
    { id: "ok", username: "alice", labStatus: "master", lastSyncedAt: SEEN },
    // The case this list exists for: a real person the sync matched before and
    // does not now, who has silently dropped out of every roster.
    { id: "renamed", username: "bob", labStatus: null, lastSyncedAt: SEEN },
    // Faculty, admin staff, people who left the realm years ago. Permanently
    // NULL and never lab members — listing them buries "renamed".
    { id: "never", username: "carol", labStatus: null, lastSyncedAt: null },
    { id: "shell", username: null, labStatus: null, lastSyncedAt: null },
    {
      id: "robot",
      username: "test-master",
      labStatus: null,
      lastSyncedAt: SEEN,
    },
  ]

  test("lists only accounts the sync used to match and now does not", () => {
    expect(unsyncedMembers(rows).map((r) => r.id)).toEqual(["renamed"])
  })

  test("an empty username is a shell account, not a missing sync", () => {
    expect(
      unsyncedMembers([
        { id: "x", username: "", labStatus: null, lastSyncedAt: SEEN },
      ])
    ).toEqual([])
  })
})
