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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS }
    )
  }

  let ids: string[]
  try {
    const body = await request.json()
    if (
      !Array.isArray(body.ids) ||
      body.ids.some((id: unknown) => typeof id !== "string")
    ) {
      throw new Error("ids must be an array of strings")
    }
    ids = body.ids as string[]
  } catch {
    return NextResponse.json(
      { error: "Body must be { ids: string[] }" },
      { status: 400, headers: CORS }
    )
  }

  if (ids.length === 0) {
    return NextResponse.json({ updated: 0 }, { headers: CORS })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("announcements")
    .update({ notified_at: new Date().toISOString() })
    .in("id", ids)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS }
    )
  }

  return NextResponse.json({ updated: ids.length }, { headers: CORS })
}
