import { NextResponse } from "next/server"

import { greetingsAuthorized } from "@/lib/door/greetings"
import { buildDoorMeeting, type DoorLeave } from "@/lib/door/meeting"
import { taipeiToday } from "@/lib/leave/date"
import { fetchNextMeeting } from "@/lib/meetings/next"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const QUERY_TIMEOUT_MS = 5000

function readFailed(what: string, detail: unknown) {
  console.error(`[door] meeting ${what} read failed`, detail)
  return NextResponse.json(
    { error: "read failed" },
    { status: 503, headers: NO_STORE }
  )
}

// Read by the door panel service with the DISPLAY_API_SECRET it already
// shares with Portal, to count down to the next lab meeting. Service role,
// read only. Returns {"meeting": {...}} for the week get_next_meeting would
// pick (today counts, holidays skipped), or {"meeting": null}.
export async function GET(request: Request) {
  const secret = process.env.DISPLAY_API_SECRET
  if (!secret || secret.length < 32) {
    console.error("[door] meeting endpoint is not configured")
    return NextResponse.json(
      { error: "not configured" },
      { status: 503, headers: NO_STORE }
    )
  }
  if (!greetingsAuthorized(request.headers.get("authorization"), secret)) {
    console.warn("[door] unauthorized meeting read")
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE }
    )
  }

  // The shared meeting queries cannot chain .abortSignal(), so the client
  // carries the signal. A plain abort() is not retried by postgrest-js.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
  try {
    const supabase = createAdminClient({ signal: controller.signal })
    const next = await fetchNextMeeting(supabase, taipeiToday())
    if (!next) {
      return NextResponse.json({ meeting: null }, { headers: NO_STORE })
    }

    const leaves = await supabase
      .from("leaves")
      .select("user_id")
      .eq("date", next.meeting.scheduledDate)
      .order("created_at", { ascending: true })
    if (leaves.error) return readFailed("leave", leaves.error.code)
    const absent = (leaves.data ?? []) as DoorLeave[]

    const ids = [
      ...new Set(
        [next.meeting.presenterUserId, ...absent.map((l) => l.user_id)].filter(
          (id): id is string => !!id
        )
      ),
    ]
    const profileNames = new Map<string, string | null>()
    if (ids.length > 0) {
      const profiles = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", ids)
      if (profiles.error) return readFailed("profile", profiles.error.code)
      for (const row of (profiles.data ?? []) as {
        id: string
        name: string | null
      }[]) {
        profileNames.set(row.id, row.name)
      }
    }

    return NextResponse.json(
      { meeting: buildDoorMeeting(next, absent, profileNames) },
      { headers: NO_STORE }
    )
  } catch (err) {
    return readFailed("schedule", err instanceof Error ? err.message : err)
  } finally {
    clearTimeout(timer)
  }
}
