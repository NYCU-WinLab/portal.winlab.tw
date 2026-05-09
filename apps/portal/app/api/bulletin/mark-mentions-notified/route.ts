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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

interface MentionPair {
  message_id: string
  mentioned_user_id: string
}

function isPair(v: unknown): v is MentionPair {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.message_id === "string" && typeof o.mentioned_user_id === "string"
  )
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS }
    )
  }

  let pairs: MentionPair[]
  try {
    const body = await request.json()
    if (!Array.isArray(body.pairs) || !body.pairs.every(isPair)) {
      throw new Error("pairs must be { message_id, mentioned_user_id }[]")
    }
    pairs = body.pairs
  } catch {
    return NextResponse.json(
      {
        error:
          "Body must be { pairs: { message_id: string, mentioned_user_id: string }[] }",
      },
      { status: 400, headers: CORS }
    )
  }

  if (pairs.length === 0) {
    return NextResponse.json({ updated: 0 }, { headers: CORS })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // The composite PK rules out a single bulk update; loop per pair.
  let updated = 0
  for (const p of pairs) {
    const { error } = await supabase
      .from("bulletin_message_mentions")
      .update({ notified_at: now })
      .eq("message_id", p.message_id)
      .eq("mentioned_user_id", p.mentioned_user_id)
      .is("notified_at", null)
    if (error) {
      return NextResponse.json(
        { error: error.message, updated },
        { status: 500, headers: CORS }
      )
    }
    updated += 1
  }

  return NextResponse.json({ updated }, { headers: CORS })
}
