import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { fetchLabStatuses } from "@/lib/keycloak/lab-status"
import {
  checkLabStatusUpdatePlan,
  planLabStatusUpdates,
} from "@/lib/meetings/lab-status"
import { matchedProfileIds } from "@/lib/meetings/sync-health"
import type { SyncRunStatus } from "@/lib/meetings/sync-health"
import { createAdminClient } from "@/lib/supabase/admin"

// Mirrors Keycloak's /lab-member/* membership into user_profiles.lab_status
// once a day. The candidate pickers on /meetings read that column, so a member
// who graduates stops being offered without anyone editing the portal. Since
// 20260831140000 it also decides who gets SCHEDULED at all, which is why every
// exit from this route now leaves a row in lab_status_sync_runs: a sync that
// stops looks identical to a quiet week from the outside, and the panel's only
// way to tell is the date on the last successful run.
//
// Runs daily rather than weekly so a single missed run only delays a status
// change by a day, and re-running is free: the sweep writes only rows whose
// status actually differs.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RunRecord = {
  status: SyncRunStatus
  scanned?: number
  changed?: number
  skippedNoUsername?: number
  detail?: string | null
}

/**
 * Record how this run ended, then hand back the HTTP response.
 *
 * Failing to write the log must never fail the sync. Observability breaking is
 * annoying; observability breaking the thing it observes is worse, and this
 * route is the only writer of lab_status.
 *
 * Note which way that failure points: a log that cannot be written leaves the
 * panel with no successful run to date and shouting 從未成功執行過 while the
 * sync is fine. A false alarm, not false calm — the safe direction for a
 * control whose whole job is to notice silence.
 */
async function recordRun(
  supabase: SupabaseClient,
  run: RunRecord,
  body: unknown,
  init?: { status?: number }
) {
  const { error } = await supabase.from("lab_status_sync_runs").insert({
    status: run.status,
    scanned: run.scanned ?? 0,
    changed: run.changed ?? 0,
    skipped_no_username: run.skippedNoUsername ?? 0,
    detail: run.detail ?? null,
  })
  if (error) {
    console.error("kc-lab-status: could not record sync run", error.message)
  }
  return NextResponse.json(body, init)
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  // Built before the Keycloak read so a failed read is still logged. It costs
  // nothing when the read then succeeds, and the alternative is that exactly
  // the runs worth knowing about leave no trace.
  const supabase = createAdminClient()

  const fetched = await fetchLabStatuses()
  // Anything short of a clean read is reported, never treated as "the realm is
  // empty" — that reading would clear every member's status in one sweep.
  if (fetched.status !== "ok") {
    return recordRun(
      supabase,
      {
        // Narrowed to "unconfigured" | "forbidden" | "error", which is
        // exactly the non-ok half of SyncRunStatus — the union is shared on
        // purpose so a new failure mode in fetchLabStatuses cannot land here
        // as an untyped string.
        status: fetched.status,
        detail: "detail" in fetched ? fetched.detail : null,
      },
      fetched,
      { status: 502 }
    )
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, username, lab_status")
  if (error) {
    return recordRun(
      supabase,
      { status: "error", detail: error.message },
      { status: "error", detail: error.message },
      { status: 500 }
    )
  }

  const rows = data.map((row) => ({
    id: row.id,
    username: row.username,
    labStatus: row.lab_status,
  }))
  const updates = planLabStatusUpdates(rows, fetched.byUsername)

  // Refuse to write a sweep that would mass-null lab_status — see
  // checkLabStatusUpdatePlan's doc comment for why that shape is almost
  // always a broken read rather than a real membership event.
  //
  // This is the branch the run log exists for. It writes not one user_profiles
  // row, so lab_status_synced_at cannot see it, and it means Keycloak just told
  // us most of the lab left — the single most interesting thing this job can
  // discover.
  const guard = checkLabStatusUpdatePlan(rows, updates)
  if (!guard.ok) {
    return recordRun(
      supabase,
      {
        status: "refused",
        scanned: rows.length,
        changed: updates.length,
        skippedNoUsername: fetched.skippedNoUsername,
        detail: guard.detail,
      },
      { status: "error", detail: guard.detail },
      { status: 502 }
    )
  }

  for (const [index, update] of updates.entries()) {
    const { error: writeError } = await supabase
      .from("user_profiles")
      .update({ lab_status: update.labStatus })
      .eq("id", update.id)
    if (writeError) {
      return recordRun(
        supabase,
        {
          status: "error",
          scanned: rows.length,
          changed: index,
          skippedNoUsername: fetched.skippedNoUsername,
          detail: writeError.message,
        },
        { status: "error", detail: writeError.message, applied: index },
        { status: 500 }
      )
    }
  }

  // Stamp everyone Keycloak had something to say about, not just the rows that
  // changed. "Unchanged" and "not seen" used to be indistinguishable in this
  // table, and they are now opposite in consequence: an unchanged member keeps
  // being scheduled, an unseen one silently drops out of every roster.
  const matched = matchedProfileIds(rows, fetched.byUsername)
  let stampedAt: string | null = null
  if (matched.length > 0) {
    stampedAt = new Date().toISOString()
    // Chunked because `.in()` is serialised into the request URI — roughly 39
    // bytes per UUID — and this list is the whole lab, growing every year. Past
    // a couple of hundred members the URI outgrows the proxy's header buffer
    // and the request comes back 414, which would show up as a red run every
    // night while the sync itself was working perfectly.
    const CHUNK = 50
    let stampError: { message: string } | null = null
    for (let i = 0; i < matched.length && !stampError; i += CHUNK) {
      const { error } = await supabase
        .from("user_profiles")
        .update({ lab_status_synced_at: stampedAt })
        .in("id", matched.slice(i, i + CHUNK))
      stampError = error
    }
    if (stampError) {
      return recordRun(
        supabase,
        {
          status: "error",
          scanned: rows.length,
          changed: updates.length,
          skippedNoUsername: fetched.skippedNoUsername,
          detail: `statuses written but timestamps not stamped: ${stampError.message}`,
        },
        {
          status: "error",
          detail: stampError.message,
          applied: updates.length,
        },
        { status: 500 }
      )
    }
  }

  // An ok run normally carries no detail. A cohort-only member is the one
  // thing worth saying on success: the sync wrote correctly and still left
  // someone out, and nothing else in the system will mention them.
  const detail =
    fetched.cohortOnly.length > 0
      ? `in a cohort group but no identity group: ${fetched.cohortOnly.join(", ")}`
      : null

  return recordRun(
    supabase,
    {
      status: "ok",
      scanned: rows.length,
      changed: updates.length,
      skippedNoUsername: fetched.skippedNoUsername,
      detail,
    },
    {
      scanned: rows.length,
      changed: updates.length,
      matched: matched.length,
      stampedAt,
      updates,
      skippedNoUsername: fetched.skippedNoUsername,
      cohortOnly: fetched.cohortOnly,
    }
  )
}
