import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

import type { DbMeeting } from "@/lib/meetings/types"

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
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("scheduled_date", date)
    .maybeSingle()

  if (error || !data || (data as DbMeeting).is_holiday) {
    return NextResponse.json(
      { error: "No schedule found for this date" },
      { status: 404, headers: CORS }
    )
  }

  const m = data as DbMeeting

  let presenterEmail: string | null = null
  if (m.presenter_user_id) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("id", m.presenter_user_id)
      .maybeSingle()
    presenterEmail = profile?.email ?? null
  }

  return NextResponse.json(
    {
      date: m.scheduled_date,
      week: m.week_label,
      presenter: m.presenter,
      presenter_email: presenterEmail,
      paper: m.paper_title,
    },
    { headers: CORS }
  )
}
