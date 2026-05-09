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
    .from("bulletin_message_mentions")
    .select(
      `
      message_id,
      mentioned_user_id,
      bulletin_messages!inner(id, content, created_at, user_profiles!bulletin_messages_author_id_fkey(name)),
      user_profiles!bulletin_message_mentions_mentioned_user_id_fkey(name, email)
    `
    )
    .is("notified_at", null)
    .order("message_id", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS }
    )
  }

  type Row = {
    message_id: string
    mentioned_user_id: string
    bulletin_messages: {
      id: string
      content: string
      created_at: string
      user_profiles: { name: string | null } | null
    } | null
    user_profiles: { name: string | null; email: string | null } | null
  }

  const mentions = (data ?? []).map((row) => {
    const r = row as unknown as Row
    return {
      message_id: r.message_id,
      mentioned_user_id: r.mentioned_user_id,
      mentioned_name: r.user_profiles?.name ?? null,
      mentioned_email: r.user_profiles?.email ?? null,
      content: r.bulletin_messages?.content ?? "",
      created_at: r.bulletin_messages?.created_at ?? "",
      author_name: r.bulletin_messages?.user_profiles?.name ?? null,
    }
  })

  return NextResponse.json({ mentions }, { headers: CORS })
}
