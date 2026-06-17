import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  GALLERY_API_CORS,
  isGalleryApiAuthorized,
} from "@/lib/gallery/api-auth"

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: GALLERY_API_CORS })
}

interface MentionPair {
  comment_id: string
  mentioned_user_id: string
}

function isPair(v: unknown): v is MentionPair {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.comment_id === "string" &&
    typeof o.mentioned_user_id === "string"
  )
}

export async function POST(request: NextRequest) {
  if (!isGalleryApiAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: GALLERY_API_CORS }
    )
  }

  let pairs: MentionPair[]
  try {
    const body = await request.json()
    if (!Array.isArray(body.pairs) || !body.pairs.every(isPair)) {
      throw new Error("pairs must be { comment_id, mentioned_user_id }[]")
    }
    pairs = body.pairs
  } catch {
    return NextResponse.json(
      {
        error:
          "Body must be { pairs: { comment_id: string, mentioned_user_id: string }[] }",
      },
      { status: 400, headers: GALLERY_API_CORS }
    )
  }

  if (pairs.length === 0) {
    return NextResponse.json({ updated: 0 }, { headers: GALLERY_API_CORS })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  let updated = 0
  for (const p of pairs) {
    const { error } = await supabase
      .from("gallery_comment_mentions")
      .update({ notified_at: now })
      .eq("comment_id", p.comment_id)
      .eq("mentioned_user_id", p.mentioned_user_id)
      .is("notified_at", null)
    if (error) {
      return NextResponse.json(
        { error: error.message, updated },
        { status: 500, headers: GALLERY_API_CORS }
      )
    }
    updated += 1
  }

  return NextResponse.json({ updated }, { headers: GALLERY_API_CORS })
}
