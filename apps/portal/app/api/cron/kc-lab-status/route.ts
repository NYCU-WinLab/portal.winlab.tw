import { NextResponse } from "next/server"

import { fetchLabStatuses } from "@/lib/keycloak/lab-status"
import {
  checkLabStatusUpdatePlan,
  planLabStatusUpdates,
} from "@/lib/meetings/lab-status"
import { createAdminClient } from "@/lib/supabase/admin"

// Mirrors Keycloak's /lab-member/* membership into user_profiles.lab_status
// once a day. The candidate pickers on /meetings read that column, so a member
// who graduates stops being offered without anyone editing the portal.
//
// Runs daily rather than weekly so a single missed run only delays a status
// change by a day, and re-running is free: the sweep writes only rows whose
// status actually differs.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  const fetched = await fetchLabStatuses()
  // Anything short of a clean read is reported, never treated as "the realm is
  // empty" — that reading would clear every member's status in one sweep.
  if (fetched.status !== "ok") {
    return NextResponse.json(fetched, { status: 502 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, username, lab_status")
  if (error) {
    return NextResponse.json(
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
  const guard = checkLabStatusUpdatePlan(rows, updates)
  if (!guard.ok) {
    return NextResponse.json(
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
      return NextResponse.json(
        { status: "error", detail: writeError.message, applied: index },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    scanned: rows.length,
    changed: updates.length,
    updates,
    skippedNoUsername: fetched.skippedNoUsername,
  })
}
