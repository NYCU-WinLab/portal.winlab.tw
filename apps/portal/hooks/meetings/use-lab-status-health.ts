"use client"

import { useQuery } from "@tanstack/react-query"

import { parseLabStatus } from "@/lib/meetings/lab-status"
import type { SyncRunStatus } from "@/lib/meetings/sync-health"
import { unsyncedMembers } from "@/lib/meetings/sync-health"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export type LabStatusHealth = {
  /** The most recent run of any kind — a job failing nightly still ran. */
  lastRun: {
    ranAt: string
    status: SyncRunStatus
    detail: string | null
  } | null
  /** The most recent run that actually wrote. What freshness is measured from. */
  lastSuccessAt: string | null
  /** Real accounts with no lab_status: silently unschedulable, and nothing else says so. */
  unsynced: { id: string; name: string | null; username: string }[]
}

/**
 * The health of the nightly Keycloak → `lab_status` mirror, for the presenter
 * panel's status line.
 *
 * Two separate reads because the two failures look nothing alike. A job that
 * has stopped being invoked leaves no rows at all, so only the DATE of the last
 * success can reveal it. A job that runs and fails — a rotated credential, a
 * lost `view-users` role, the blast-radius guard refusing a bad sweep — leaves
 * rows every night, which is why `lastRun` is fetched separately from
 * `lastSuccessAt` rather than inferred from it.
 */
export function useLabStatusHealth() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.labStatusHealth.all,
    queryFn: async (): Promise<LabStatusHealth> => {
      const [runs, lastOk, profiles] = await Promise.all([
        supabase
          .from("lab_status_sync_runs")
          .select("ran_at, status, detail")
          .order("ran_at", { ascending: false })
          .limit(1),
        supabase
          .from("lab_status_sync_runs")
          .select("ran_at")
          .eq("status", "ok")
          .order("ran_at", { ascending: false })
          .limit(1),
        supabase
          .from("user_profiles")
          .select("id, name, username, lab_status, lab_status_synced_at"),
      ])

      if (runs.error) throw runs.error
      if (lastOk.error) throw lastOk.error
      if (profiles.error) throw profiles.error

      const run = runs.data[0]
      const rows = profiles.data.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        labStatus: parseLabStatus(row.lab_status),
        lastSyncedAt: row.lab_status_synced_at,
      }))

      return {
        lastRun: run
          ? {
              ranAt: run.ran_at,
              status: run.status as SyncRunStatus,
              detail: run.detail,
            }
          : null,
        lastSuccessAt: lastOk.data[0]?.ran_at ?? null,
        unsynced: unsyncedMembers(rows).map((r) => ({
          id: r.id,
          name: r.name,
          // unsyncedMembers has already established this is non-empty; the
          // cast keeps the panel from re-litigating it.
          username: r.username as string,
        })),
      }
    },
  })
}
