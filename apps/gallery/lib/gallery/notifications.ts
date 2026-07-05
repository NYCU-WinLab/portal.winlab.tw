import type { SupabaseClient } from "@supabase/supabase-js"

import type { GalleryReaction } from "@/lib/gallery/reactions"
import {
  fetchGalleryMentionNotification,
  loadUnreadGalleryMentions,
  type GalleryMentionNotification,
} from "@/lib/gallery/mention-notifications"

export type GalleryNotificationKind =
  | "mention"
  | "reply"
  | "reaction"
  | "comment_like"

export type GalleryNotification = {
  key: string
  kind: GalleryNotificationKind
  image_id: string
  image_name: string
  comment_id: string | null
  actor_name: string
  body: string | null
  reaction: GalleryReaction | null
  created_at: string
  mention_comment_id: string | null
  activity_id: string | null
}

type ActivityRow = {
  id: string
  kind: "reply" | "reaction" | "comment_like"
  image_id: string
  comment_id: string | null
  reaction: string | null
  body: string | null
  created_at: string
  gallery_images: { id: string; name: string } | null
  user_profiles: { name: string | null } | null
}

const ACTIVITY_SELECT = `
  id,
  kind,
  image_id,
  comment_id,
  reaction,
  body,
  created_at,
  gallery_images!inner(id, name),
  user_profiles!gallery_activity_notifications_actor_user_id_fkey(name)
`

function mapMention(n: GalleryMentionNotification): GalleryNotification {
  return {
    key: `mention:${n.comment_id}`,
    kind: "mention",
    image_id: n.image_id,
    image_name: n.image_name,
    comment_id: n.comment_id,
    actor_name: n.author_name,
    body: n.body,
    reaction: null,
    created_at: n.created_at,
    mention_comment_id: n.comment_id,
    activity_id: null,
  }
}

function mapActivity(row: ActivityRow): GalleryNotification | null {
  return {
    key: `${row.kind}:${row.id}`,
    kind: row.kind,
    image_id: row.image_id,
    image_name: row.gallery_images?.name ?? "Photo",
    comment_id: row.comment_id,
    actor_name: row.user_profiles?.name?.trim() || "Someone",
    body: row.body,
    reaction: (row.reaction as GalleryReaction | null) ?? null,
    created_at: row.created_at,
    mention_comment_id: null,
    activity_id: row.id,
  }
}

export function sortGalleryNotifications(
  items: GalleryNotification[]
): GalleryNotification[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function loadUnreadGalleryNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<GalleryNotification[]> {
  const [mentions, activityResult] = await Promise.all([
    loadUnreadGalleryMentions(supabase, userId),
    supabase
      .from("gallery_activity_notifications")
      .select(ACTIVITY_SELECT)
      .eq("recipient_user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false }),
  ])

  const activityRows: GalleryNotification[] = []
  if (activityResult.error) {
    if (!isActivityNotificationsUnavailable(activityResult.error)) {
      console.error(
        "[gallery] failed to load activity notifications",
        activityResult.error
      )
    }
  } else {
    for (const row of (activityResult.data ?? []) as unknown as ActivityRow[]) {
      const mapped = mapActivity(row)
      if (mapped) activityRows.push(mapped)
    }
  }

  return sortGalleryNotifications([
    ...mentions.map(mapMention),
    ...activityRows,
  ])
}

export function isActivityNotificationsUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /gallery_activity_notifications/i.test(message) ||
    /schema cache/i.test(message)
  )
}

export async function fetchGalleryActivityNotification(
  supabase: SupabaseClient,
  activityId: string,
  userId: string
): Promise<GalleryNotification | null> {
  const { data, error } = await supabase
    .from("gallery_activity_notifications")
    .select(ACTIVITY_SELECT)
    .eq("id", activityId)
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .maybeSingle()

  if (error || !data) return null
  return mapActivity(data as unknown as ActivityRow)
}

export { fetchGalleryMentionNotification }
