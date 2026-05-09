import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

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
    .from("bulletin_messages")
    .select(
      "id, content, created_at, user_profiles!bulletin_messages_author_id_fkey(name, email)"
    )
    .eq("is_broadcast", true)
    .is("broadcast_notified_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS }
    )
  }

  type Row = {
    id: string
    content: string
    created_at: string
    user_profiles: { name: string | null; email: string | null } | null
  }
  const broadcasts = (data ?? []).map((row) => {
    const r = row as unknown as Row
    return {
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      author_name: r.user_profiles?.name ?? null,
      author_email: r.user_profiles?.email ?? null,
    }
  })

  return NextResponse.json({ broadcasts }, { headers: CORS })
}
