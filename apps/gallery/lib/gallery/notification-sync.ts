import {
  parseMentions,
  resolveMentionedProfiles,
  type MentionProfile,
} from "@/lib/gallery/mentions"
import type { GalleryReaction } from "@/lib/gallery/reactions"
import { createAdminClient } from "@/lib/supabase/admin"

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Pure plan for syncing gallery_comment_mentions rows after a comment
 * create/edit. I/O stays in syncGalleryCommentMentions.
 */
export function planCommentMentionSync(input: {
  body: string
  authorId: string
  existingMentionUserIds: string[]
  profiles: MentionProfile[]
}): {
  mentionNames: string[]
  clearAll: boolean
  toRemove: string[]
  toAdd: MentionProfile[]
} {
  const mentionNames = parseMentions(input.body)
  const existingIds = new Set(input.existingMentionUserIds)

  if (mentionNames.length === 0) {
    return {
      mentionNames,
      clearAll: existingIds.size > 0,
      toRemove: [...existingIds],
      toAdd: [],
    }
  }

  const matched = resolveMentionedProfiles(mentionNames, input.profiles)
  const others = matched.filter((profile) => profile.id !== input.authorId)
  const targetIds = new Set(others.map((profile) => profile.id))

  return {
    mentionNames,
    clearAll: false,
    toRemove: [...existingIds].filter((id) => !targetIds.has(id)),
    toAdd: others.filter((profile) => !existingIds.has(profile.id)),
  }
}

export async function syncGalleryReactionNotification(
  admin: AdminClient,
  {
    imageId,
    actorUserId,
    reaction,
    mode,
  }: {
    imageId: string
    actorUserId: string
    reaction: GalleryReaction | null
    mode: "insert" | "update" | "remove"
  }
) {
  const { data: image } = await admin
    .from("gallery_images")
    .select("created_by")
    .eq("id", imageId)
    .maybeSingle()

  if (!image?.created_by || image.created_by === actorUserId) return

  const recipientId = image.created_by

  if (mode === "remove") {
    const { error } = await admin
      .from("gallery_activity_notifications")
      .delete()
      .eq("kind", "reaction")
      .eq("image_id", imageId)
      .eq("actor_user_id", actorUserId)
      .eq("recipient_user_id", recipientId)
      .is("read_at", null)

    if (error) {
      console.error("[gallery] failed to remove reaction notification", error)
    }
    return
  }

  if (mode === "update" && reaction) {
    const { data: updated, error } = await admin
      .from("gallery_activity_notifications")
      .update({ reaction, created_at: new Date().toISOString() })
      .eq("kind", "reaction")
      .eq("image_id", imageId)
      .eq("actor_user_id", actorUserId)
      .eq("recipient_user_id", recipientId)
      .is("read_at", null)
      .select("id")

    if (error) {
      console.error("[gallery] failed to update reaction notification", error)
      return
    }

    if (!updated || updated.length === 0) {
      const { error: insertError } = await admin
        .from("gallery_activity_notifications")
        .insert({
          recipient_user_id: recipientId,
          kind: "reaction",
          image_id: imageId,
          actor_user_id: actorUserId,
          reaction,
        })
      if (insertError && insertError.code !== "23505") {
        console.error(
          "[gallery] failed to save reaction notification",
          insertError
        )
      }
    }
    return
  }

  if (mode === "insert" && reaction) {
    const { error } = await admin
      .from("gallery_activity_notifications")
      .insert({
        recipient_user_id: recipientId,
        kind: "reaction",
        image_id: imageId,
        actor_user_id: actorUserId,
        reaction,
      })
    if (error && error.code !== "23505") {
      console.error("[gallery] failed to save reaction notification", error)
    }
  }
}

export async function syncGalleryCommentMentions(
  admin: AdminClient,
  commentId: string,
  body: string,
  authorId: string
) {
  const { data: existingRows } = await admin
    .from("gallery_comment_mentions")
    .select("mentioned_user_id")
    .eq("comment_id", commentId)

  const existingMentionUserIds = (existingRows ?? []).map(
    (row) => row.mentioned_user_id as string
  )

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, name")
    .not("name", "is", null)

  const plan = planCommentMentionSync({
    body,
    authorId,
    existingMentionUserIds,
    profiles: profiles ?? [],
  })

  if (plan.clearAll) {
    const { error } = await admin
      .from("gallery_comment_mentions")
      .delete()
      .eq("comment_id", commentId)
    if (error) {
      console.error("[gallery] failed to clear comment mentions", error)
    }
    return
  }

  if (plan.mentionNames.length === 0) return

  if (plan.toRemove.length > 0) {
    const { error } = await admin
      .from("gallery_comment_mentions")
      .delete()
      .eq("comment_id", commentId)
      .in("mentioned_user_id", plan.toRemove)
    if (error) {
      console.error("[gallery] failed to remove stale mentions", error)
    }
  }

  if (plan.toAdd.length === 0) return

  const { error: mentionError } = await admin
    .from("gallery_comment_mentions")
    .insert(
      plan.toAdd.map((profile) => ({
        comment_id: commentId,
        mentioned_user_id: profile.id,
      }))
    )
  if (mentionError) {
    console.error("[gallery] failed to save comment mentions", mentionError)
  }
}

export async function syncGalleryCommentLikeNotification(
  admin: AdminClient,
  {
    commentId,
    actorUserId,
    liked,
  }: {
    commentId: string
    actorUserId: string
    liked: boolean
  }
) {
  const { data: comment } = await admin
    .from("gallery_comments")
    .select("created_by, image_id, body")
    .eq("id", commentId)
    .maybeSingle()

  if (!comment?.created_by || comment.created_by === actorUserId) return

  if (liked) {
    const { error } = await admin
      .from("gallery_activity_notifications")
      .insert({
        recipient_user_id: comment.created_by,
        kind: "comment_like",
        image_id: comment.image_id,
        comment_id: commentId,
        actor_user_id: actorUserId,
        body: comment.body.slice(0, 200),
      })
    if (error && error.code !== "23505") {
      console.error("[gallery] failed to save comment like notification", error)
    }
    return
  }

  const { error } = await admin
    .from("gallery_activity_notifications")
    .delete()
    .eq("kind", "comment_like")
    .eq("comment_id", commentId)
    .eq("actor_user_id", actorUserId)
    .eq("recipient_user_id", comment.created_by)
    .is("read_at", null)

  if (error) {
    console.error("[gallery] failed to remove comment like notification", error)
  }
}
