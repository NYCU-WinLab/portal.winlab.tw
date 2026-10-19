import { NextRequest, NextResponse } from "next/server"

import { createClient as createServiceRoleClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import {
  PRESENTER_PROFILE,
  presenterName,
  presenterOrder,
  type PresenterRow,
} from "@/lib/meetings/presenter-name"
import type { DbMeeting } from "@/lib/meetings/types"

function createServiceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.winlab.tw"

// Server-to-server callers (the Apps Script reminder mailer) can't carry a
// Supabase login cookie, so they authenticate with a shared secret instead —
// same pattern as the bulletin API. Browser sessions still work via cookie.
function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.MEETINGS_API_SECRET
  if (!secret) return false
  return (request.headers.get("Authorization") ?? "") === `Bearer ${secret}`
}

const CORS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json; charset=utf-8",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  // Accept either a valid shared secret (server-to-server) or a logged-in
  // Supabase session (browser). The secret check avoids the cookie round-trip.
  if (!hasValidSecret(request)) {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS }
      )
    }
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date parameter (expected YYYY-MM-DD)" },
      { status: 400, headers: CORS }
    )
  }

  const supabase = createServiceClient()

  const [
    { data: meetingData, error },
    { data: upcomingData, error: upcomingError },
    { data: poolData },
  ] = await Promise.all([
    supabase
      .from("meetings")
      .select(`*, ${PRESENTER_PROFILE}`)
      .eq("scheduled_date", date)
      .maybeSingle(),
    supabase
      .from("meetings")
      .select(
        `presenter, presenter_user_id, scheduled_date, ${PRESENTER_PROFILE}`
      )
      .gt("scheduled_date", date)
      .eq("is_holiday", false)
      // A linked member can carry a null copy; their name comes from the
      // profile, so either side having one is enough.
      .or("presenter.not.is.null,presenter_user_id.not.is.null")
      .order("scheduled_date", { ascending: true })
      .limit(12),
    // Everyone currently in the rotation: on the roster, not switched off, and
    // a grad student. meeting_question_pool alone would also list paused
    // members and graduates the automation no longer schedules.
    supabase
      .from("meeting_question_rotation")
      .select("name")
      .eq("is_enabled", true)
      .eq("is_active", true)
      .order("joined_on")
      .order("user_id"),
  ])

  if (error || !meetingData) {
    return NextResponse.json(
      { error: "No schedule found for this date" },
      { status: 404, headers: CORS }
    )
  }

  const m = meetingData as unknown as DbMeeting

  if (m.is_holiday) {
    return NextResponse.json(
      {
        is_holiday: true,
        date: m.scheduled_date,
        week_label: m.week_label ?? null,
        notes: m.notes ?? null,
      },
      { headers: CORS }
    )
  }

  // Fetch presenter email
  let presenterEmail: string | null = null
  if (m.presenter_user_id) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", m.presenter_user_id)
      .maybeSingle()
    presenterEmail = profile?.email ?? null
  }

  // Fetch this week's questioners (runs after the meeting row is loaded)
  const { data: questionersData } = await supabase
    .from("meeting_questioners")
    .select("user_id, user_profiles(name, email)")
    .eq("meeting_id", m.id)

  const questioners = (
    (questionersData ?? []) as unknown as Array<{
      user_id: string
      user_profiles: { name: string | null; email: string | null } | null
    }>
  ).map((row) => ({
    name: row.user_profiles?.name ?? null,
    email: row.user_profiles?.email ?? null,
  }))

  // Backward-compatible shape for the Apps Script mailer: null when the week
  // has no questioners assigned yet, otherwise the questioner names.
  const questionGroup: { number: null; members: string[] } | null =
    questioners.length === 0
      ? null
      : { number: null, members: questioners.map((q) => q.name ?? "") }

  // The meeting itself still answers when this read fails, but an empty
  // presenter_order would look like nobody is scheduled, so leave a trace.
  if (upcomingError) {
    console.error(
      `[meetings] schedule upcoming presenters read failed: ${upcomingError.message}`
    )
  }
  const order = presenterOrder(
    (upcomingData ?? []) as unknown as PresenterRow[]
  )

  // Backward-compatible array-of-arrays shape: a single element wrapping the
  // full question pool (fixed groups no longer exist).
  const poolNames = (poolData ?? []).map((row) => row.name ?? "")
  const questionGroups = [poolNames]

  return NextResponse.json(
    {
      date: m.scheduled_date,
      week: m.week_label,
      presenter: presenterName(m.presenter, m.presenter_profile),
      presenter_email: presenterEmail,
      paper: m.paper_title,
      location: m.location,
      start_time: m.start_time,
      question_group: questionGroup,
      question_groups: questionGroups,
      questioners,
      next_presenter: order[0] ?? null,
      presenter_order: order,
    },
    { headers: CORS }
  )
}
