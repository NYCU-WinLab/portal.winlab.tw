import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

import type { DbMeeting, DbMeetingGroup } from "@/lib/meetings/types"

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date parameter (expected YYYY-MM-DD)" },
      { status: 400, headers: CORS }
    )
  }

  const supabase = createServiceClient()

  const [{ data: meetingData, error }, { data: upcomingData }] =
    await Promise.all([
      supabase
        .from("meetings")
        .select("*")
        .eq("scheduled_date", date)
        .maybeSingle(),
      supabase
        .from("meetings")
        .select("presenter, scheduled_date")
        .gt("scheduled_date", date)
        .eq("is_holiday", false)
        .not("presenter", "is", null)
        .order("scheduled_date", { ascending: true })
        .limit(12),
    ])

  if (error || !meetingData || (meetingData as DbMeeting).is_holiday) {
    return NextResponse.json(
      { error: "No schedule found for this date" },
      { status: 404, headers: CORS }
    )
  }

  const m = meetingData as DbMeeting

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

  // Fetch question group members if assigned
  let questionGroup: { number: number; members: string[] } | null = null
  if (m.question_group_number) {
    const { data: group } = await supabase
      .from("meeting_groups")
      .select("group_number, members")
      .eq("group_number", m.question_group_number)
      .maybeSingle()
    if (group) {
      const g = group as Pick<DbMeetingGroup, "group_number" | "members">
      questionGroup = { number: g.group_number, members: g.members }
    }
  }

  // Deduplicate presenter_order (keep first occurrence per name)
  const upcoming = (upcomingData ?? []) as Array<{
    presenter: string | null
    scheduled_date: string
  }>
  const seen = new Set<string>()
  const presenterOrder: string[] = []
  for (const row of upcoming) {
    if (row.presenter && !seen.has(row.presenter)) {
      seen.add(row.presenter)
      presenterOrder.push(row.presenter)
    }
  }

  return NextResponse.json(
    {
      date: m.scheduled_date,
      week: m.week_label,
      presenter: m.presenter,
      presenter_email: presenterEmail,
      paper: m.paper_title,
      location: m.location,
      start_time: m.start_time,
      question_group: questionGroup,
      next_presenter: presenterOrder[0] ?? null,
      presenter_order: presenterOrder,
    },
    { headers: CORS }
  )
}
