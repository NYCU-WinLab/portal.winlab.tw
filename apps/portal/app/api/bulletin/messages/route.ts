import { NextRequest, NextResponse } from "next/server"

import { createClient as createServiceRoleClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import { parseMentions } from "@/lib/bulletin/types"

function createServiceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let content: string
  let isBroadcast: boolean
  try {
    const body = await request.json()
    if (typeof body.content !== "string" || !body.content.trim()) {
      throw new Error("content required")
    }
    content = body.content.trim()
    isBroadcast = Boolean(body.is_broadcast)
  } catch {
    return NextResponse.json(
      { error: "Body must be { content: string, is_broadcast?: boolean }" },
      { status: 400 }
    )
  }

  // RLS will reject is_broadcast=true unless caller is admin; let it speak.
  const { data: inserted, error: insertError } = await supabase
    .from("bulletin_messages")
    .insert({
      content,
      author_id: user.id,
      is_broadcast: isBroadcast,
    })
    .select(
      "id, content, author_id, is_broadcast, broadcast_notified_at, created_at"
    )
    .single()

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to insert message" },
      { status: 400 }
    )
  }

  // Resolve @mentions against user_profiles.name. Use service role so that
  // the lookup is not gated by RLS on user_profiles (read-self only).
  const mentionNames = parseMentions(content)
  let mentionRows: { id: string; name: string | null; email: string | null }[] =
    []
  if (mentionNames.length > 0) {
    const service = createServiceClient()
    const { data } = await service
      .from("user_profiles")
      .select("id, name, email")
      .in("name", mentionNames)
    mentionRows = data ?? []

    if (mentionRows.length > 0) {
      await service.from("bulletin_message_mentions").insert(
        mentionRows.map((u) => ({
          message_id: inserted.id,
          mentioned_user_id: u.id,
        }))
      )
    }
  }

  return NextResponse.json({
    id: inserted.id,
    mentions_resolved: mentionRows.length,
  })
}
