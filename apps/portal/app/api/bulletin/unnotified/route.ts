import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

import type { DbAnnouncement } from "@/lib/bulletin/types"

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.BULLETIN_API_SECRET
  if (!secret) return false
  const auth = request.headers.get("Authorization") ?? ""
  return auth === `Bearer ${secret}`
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, tags, created_at")
    .eq("is_published", true)
    .is("notified_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS }
    )
  }

  return NextResponse.json(
    {
      announcements: (data ?? []) as Pick<
        DbAnnouncement,
        "id" | "title" | "content" | "tags" | "created_at"
      >[],
    },
    { headers: CORS }
  )
}
