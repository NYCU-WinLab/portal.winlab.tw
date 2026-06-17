import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  GALLERY_API_CORS,
  isGalleryApiAuthorized,
} from "@/lib/gallery/api-auth"

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: GALLERY_API_CORS })
}

export async function GET(request: NextRequest) {
  if (!isGalleryApiAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: GALLERY_API_CORS }
    )
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("gallery_comment_mentions")
    .select(
      `
      comment_id,
      mentioned_user_id,
      gallery_comments!inner(
        id,
        body,
        created_at,
        image_id,
        gallery_images!inner(id, name),
        user_profiles!gallery_comments_created_by_fkey(name)
      ),
      user_profiles!gallery_comment_mentions_mentioned_user_id_fkey(name, email)
    `
    )
    .is("notified_at", null)
    .order("comment_id", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: GALLERY_API_CORS }
    )
  }

  type Row = {
    comment_id: string
    mentioned_user_id: string
    gallery_comments: {
      id: string
      body: string
      created_at: string
      image_id: string
      gallery_images: { id: string; name: string } | null
      user_profiles: { name: string | null } | null
    } | null
    user_profiles: { name: string | null; email: string | null } | null
  }

  const mentions = (data ?? []).map((row) => {
    const r = row as unknown as Row
    return {
      comment_id: r.comment_id,
      mentioned_user_id: r.mentioned_user_id,
      mentioned_name: r.user_profiles?.name ?? null,
      mentioned_email: r.user_profiles?.email ?? null,
      body: r.gallery_comments?.body ?? "",
      created_at: r.gallery_comments?.created_at ?? "",
      image_id: r.gallery_comments?.image_id ?? "",
      image_name: r.gallery_comments?.gallery_images?.name ?? "",
      author_name: r.gallery_comments?.user_profiles?.name ?? null,
    }
  })

  return NextResponse.json({ mentions }, { headers: GALLERY_API_CORS })
}
