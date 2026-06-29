import type { SupabaseClient } from "@supabase/supabase-js"

export type GalleryMentionNotification = {
  comment_id: string
  image_id: string
  image_name: string
  body: string
  author_name: string
  created_at: string
}

type MentionRow = {
  comment_id: string
  gallery_comments: {
    id: string
    body: string
    created_at: string
    image_id: string
    gallery_images: { id: string; name: string } | null
    user_profiles: { name: string | null } | null
  } | null
}

function mapMentionRow(row: MentionRow): GalleryMentionNotification | null {
  const comment = row.gallery_comments
  if (!comment) return null
  return {
    comment_id: row.comment_id,
    image_id: comment.image_id,
    image_name: comment.gallery_images?.name ?? "Photo",
    body: comment.body,
    author_name: comment.user_profiles?.name?.trim() || "Someone",
    created_at: comment.created_at,
  }
}

const MENTION_SELECT = `
  comment_id,
  gallery_comments!inner(
    id,
    body,
    created_at,
    image_id,
    gallery_images!inner(id, name),
    user_profiles!gallery_comments_created_by_fkey(name)
  )
`

export function isGalleryMentionReadAtUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  return (
    error.code === "42703" ||
    /read_at/i.test(message) ||
    /column.*does not exist/i.test(message)
  )
}

export async function loadUnreadGalleryMentions(
  supabase: SupabaseClient,
  userId: string
): Promise<GalleryMentionNotification[]> {
  const { data, error } = await supabase
    .from("gallery_comment_mentions")
    .select(MENTION_SELECT)
    .eq("mentioned_user_id", userId)
    .is("read_at", null)

  if (error) {
    if (isGalleryMentionReadAtUnavailable(error)) return []
    console.error("[gallery] failed to load mention notifications", error)
    return []
  }

  const notifications = ((data ?? []) as unknown as MentionRow[])
    .map(mapMentionRow)
    .filter((row): row is GalleryMentionNotification => row !== null)

  notifications.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return notifications
}

export async function fetchGalleryMentionNotification(
  supabase: SupabaseClient,
  commentId: string,
  userId: string
): Promise<GalleryMentionNotification | null> {
  const { data, error } = await supabase
    .from("gallery_comment_mentions")
    .select(MENTION_SELECT)
    .eq("comment_id", commentId)
    .eq("mentioned_user_id", userId)
    .is("read_at", null)
    .maybeSingle()

  if (error || !data) return null
  return mapMentionRow(data as unknown as MentionRow)
}
