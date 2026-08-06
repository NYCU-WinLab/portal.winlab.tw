// Read-only booking feed for the GitLab side to poll.
//
// GitLab reads this and maintains one marker comment per related issue.
// Deliberately this direction: Portal needs no GitLab write credential, and
// the comment has exactly one writer, so a reschedule rewrites the same
// comment instead of accumulating a new one each time.

import { NextResponse } from "next/server"

import {
  resolveWindow,
  toFeedItem,
  type FeedRow,
} from "@/lib/rooms/bookings-feed"
import { meetingJoinUrl } from "@/lib/rooms/invite-mail"
import { todayInTaipei } from "@/lib/rooms/date"
import { bearerToken } from "@/lib/rooms/meeting-request"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: Request): boolean {
  const secret = process.env.ROOMS_API_SECRET
  // No secret configured means no access, not open access.
  if (!secret) return false
  const presented = bearerToken(request.headers.get("authorization"))
  if (!presented || presented.length !== secret.length) return false

  // Constant-time-ish: compare every byte regardless of where it diverges.
  let diff = 0
  for (let i = 0; i < secret.length; i++) {
    diff |= presented.charCodeAt(i) ^ secret.charCodeAt(i)
  }
  return diff === 0
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const resolved = resolveWindow(
    searchParams.get("from"),
    searchParams.get("to"),
    todayInTaipei()
  )
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }
  const { from, to } = resolved.window

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("rooms_bookings")
    .select(
      "id, date, start_time, end_time, room, title, status, online, issue_refs"
    )
    // Cancelled rows are included on purpose — see bookings-feed.ts. Their
    // absence would be indistinguishable from "finished" or "endpoint broke".
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("start_time")

  if (error) {
    return NextResponse.json({ error: "query failed" }, { status: 500 })
  }

  return NextResponse.json(
    {
      window: { from, to },
      bookings: ((data ?? []) as FeedRow[]).map((row) =>
        toFeedItem(row, meetingJoinUrl)
      ),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
