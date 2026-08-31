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
  test("two days is still fresh, three is not", () => {
    expect(syncFreshness(daysAgo(2), NOW).level).toBe("fresh")
    expect(syncFreshness(daysAgo(3), NOW)).toEqual({ level: "stale", days: 3 })
  })

  test("a timestamp in the future reads as zero days, not negative", () => {
    expect(syncFreshness(daysAgo(-5), NOW)).toEqual({ level: "fresh", days: 0 })
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
  const rows: LabStatusRow[] = [
    { id: "ok", username: "alice", labStatus: "master" },
    // The case this list exists for: a real person who renamed themselves in
    // Keycloak and has silently dropped out of every roster.
    { id: "renamed", username: "bob", labStatus: null },
    { id: "shell", username: null, labStatus: null },
    { id: "robot", username: "test-master", labStatus: null },
  ]

  test("lists only real accounts that have no status", () => {
    expect(unsyncedMembers(rows).map((r) => r.id)).toEqual(["renamed"])
  })

  test("an empty username is a shell account, not a missing sync", () => {
    expect(
      unsyncedMembers([{ id: "x", username: "", labStatus: null }])
    ).toEqual([])
  })
})
