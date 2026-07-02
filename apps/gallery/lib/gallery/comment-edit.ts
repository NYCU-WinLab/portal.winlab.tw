import type { SupabaseClient } from "@supabase/supabase-js"

const COMMENT_SELECT_BASE =
  "id, image_id, parent_id, body, created_by, created_at"
const COMMENT_SELECT_WITH_EDIT = `${COMMENT_SELECT_BASE}, updated_at`

export type GalleryCommentRow = {
  id: string
  image_id: string
  parent_id: string | null
  body: string
  created_by: string
  created_at: string
  updated_at?: string | null
}

export function isGalleryCommentEditUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /updated_at/i.test(message) ||
    /gallery_comments_update/i.test(message) ||
    /schema cache/i.test(message)
  )
}

export function formatGallerySupabaseError(
  error: {
    code?: string
    message?: string
    details?: string
    hint?: string
  } | null
): string {
  if (!error) return "Unknown error"
  const parts = [
    error.message,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean)
  return parts.join(" | ") || "Unknown error"
}

export async function loadGalleryCommentRows(
  supabase: SupabaseClient,
  imageIds: string[]
): Promise<
  { data: GalleryCommentRow[]; error: null } | { data: []; error: string }
> {
  if (imageIds.length === 0) return { data: [], error: null }

  const withEdit = await supabase
    .from("gallery_comments")
    .select(COMMENT_SELECT_WITH_EDIT)
    .in("image_id", imageIds)
    .order("created_at", { ascending: true })

  if (!withEdit.error) {
    return { data: (withEdit.data ?? []) as GalleryCommentRow[], error: null }
  }

  if (!isGalleryCommentEditUnavailable(withEdit.error)) {
    return {
      data: [],
      error: formatGallerySupabaseError(withEdit.error),
    }
  }

  const fallback = await supabase
    .from("gallery_comments")
    .select(COMMENT_SELECT_BASE)
    .in("image_id", imageIds)
    .order("created_at", { ascending: true })

  if (fallback.error) {
    return {
      data: [],
      error: formatGallerySupabaseError(fallback.error),
    }
  }

  return {
    data: ((fallback.data ?? []) as GalleryCommentRow[]).map((row) => ({
      ...row,
      updated_at: null,
    })),
    error: null,
  }
}
