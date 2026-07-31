// Where the GitLab pipeline reports the Teams meeting it created.
//
// Authentication is per-request, not a shared secret: each trigger mints a
// one-shot token, and only its SHA-256 is stored. The token reaches the
// pipeline as a GitLab trigger variable, which is not masked and can end up
// in job logs — scoping it to a single request means a leak buys nothing
// beyond a request that has already been answered.
//
// The pipeline retries a non-2xx three times, so every branch here has to be
// safe to run twice. Anything already resolved returns 200 without acting.

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { readCallback } from "@/lib/rooms/meeting-callback"
import { bearerToken, callbackTokenMatches } from "@/lib/rooms/meeting-request"
import {
  applyMeetingOutcome,
  type MeetingRequestRow,
} from "@/lib/rooms/meeting-result"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const presented = bearerToken(request.headers.get("authorization"))
  if (!presented) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const read = readCallback(body, request.headers.get("x-request-id"))
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("rooms_meeting_requests")
    .select("id, request_id, booking_id, status, kind, callback_token_hash")
    .eq("request_id", read.requestId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 })
  }
  // 404 rather than 401 would tell an unauthenticated caller which request
  // ids exist, so an unknown id and a bad token answer identically.
  if (!data || !callbackTokenMatches(presented, data.callback_token_hash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const row: MeetingRequestRow = {
    id: data.id,
    request_id: data.request_id,
    booking_id: data.booking_id,
    status: data.status,
    kind: data.kind,
  }

  // The pipeline echoes the ACTION it ran. If that disagrees with what this
  // request was created for, something is crossed — applying it would write
  // a creation's result onto a cancellation or vice versa.
  if (read.action !== row.kind) {
    return NextResponse.json(
      { error: `action ${read.action} 與這筆請求的 ${row.kind} 不符` },
      { status: 400 }
    )
  }

  // Idempotency. A 2xx here is what stops the pipeline retrying, so a repeat
  // delivery of an already-applied result is an accepted no-op, not an error.
  if (row.status !== "pending") {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  try {
    const result = await applyMeetingOutcome(admin, row, read.outcome)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // 5xx so the pipeline retries — the result hasn't been recorded.
    const message = err instanceof Error ? err.message : String(err)
    console.error("[rooms] meeting callback failed", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
