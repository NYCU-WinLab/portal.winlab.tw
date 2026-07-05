"use server"

import { revalidatePath } from "next/cache"

import {
  type GalleryReaction,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import { parseMentions, resolveMentionedProfiles } from "@/lib/gallery/mentions"
import { isGalleryCommentEditUnavailable } from "@/lib/gallery/comment-edit"
import {
  type GallerySeasonalThemeId,
  isGallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"
import { setGallerySeasonalThemeId } from "@/lib/gallery/settings"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type ReactionActionResult = { ok: true } | { ok: false; error: string }
export type CommentActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string }

async function syncGalleryReactionNotification(
  admin: ReturnType<typeof createAdminClient>,
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

export async function setGalleryReaction(
  imageId: string,
  reaction: GalleryReaction
): Promise<ReactionActionResult> {
  if (!imageId) return { ok: false, error: "Missing image id." }
  if (!isGalleryReaction(reaction)) {
    return { ok: false, error: "Invalid reaction." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: existing, error: fetchError } = await supabase
    .from("gallery_image_votes")
    .select("reaction")
    .eq("image_id", imageId)
    .eq("user_id", userId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, error: `Reaction failed: ${fetchError.message}` }
  }

  if (existing?.reaction === reaction) {
    const { error: deleteError } = await supabase
      .from("gallery_image_votes")
      .delete()
      .eq("image_id", imageId)
      .eq("user_id", userId)

    if (deleteError) {
      return { ok: false, error: `Reaction failed: ${deleteError.message}` }
    }

    const admin = createAdminClient()
    await syncGalleryReactionNotification(admin, {
      imageId,
      actorUserId: userId,
      reaction: null,
      mode: "remove",
    })
  } else if (existing) {
    const { error: updateError } = await supabase
      .from("gallery_image_votes")
      .update({ reaction })
      .eq("image_id", imageId)
      .eq("user_id", userId)

    if (updateError) {
      return { ok: false, error: `Reaction failed: ${updateError.message}` }
    }

    const admin = createAdminClient()
    await syncGalleryReactionNotification(admin, {
      imageId,
      actorUserId: userId,
      reaction,
      mode: "update",
    })
  } else {
    const { error: insertError } = await supabase
      .from("gallery_image_votes")
      .insert({ image_id: imageId, user_id: userId, reaction })

    if (insertError) {
      return { ok: false, error: `Reaction failed: ${insertError.message}` }
    }

    const admin = createAdminClient()
    await syncGalleryReactionNotification(admin, {
      imageId,
      actorUserId: userId,
      reaction,
      mode: "insert",
    })
  }

  revalidatePath("/")
  return { ok: true }
}

export type CreatedGalleryComment = {
  id: string
  image_id: string
  parent_id: string | null
  body: string
  created_by: string
  created_at: string
  updated_at: string | null
  pinned_at?: string | null
  like_count?: number
  liked_by_me?: boolean
}

async function syncGalleryCommentMentions(
  admin: ReturnType<typeof createAdminClient>,
  commentId: string,
  body: string,
  authorId: string
) {
  const mentionNames = parseMentions(body)
  const { data: existingRows } = await admin
    .from("gallery_comment_mentions")
    .select("mentioned_user_id")
    .eq("comment_id", commentId)

  const existingIds = new Set(
    (existingRows ?? []).map((row) => row.mentioned_user_id)
  )

  if (mentionNames.length === 0) {
    if (existingIds.size > 0) {
      const { error } = await admin
        .from("gallery_comment_mentions")
        .delete()
        .eq("comment_id", commentId)
      if (error) {
        console.error("[gallery] failed to clear comment mentions", error)
      }
    }
    return
  }

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, name")
    .not("name", "is", null)

  const matched = resolveMentionedProfiles(mentionNames, profiles ?? [])
  const others = matched.filter((profile) => profile.id !== authorId)
  const targetIds = new Set(others.map((profile) => profile.id))

  const toRemove = [...existingIds].filter((id) => !targetIds.has(id))
  if (toRemove.length > 0) {
    const { error } = await admin
      .from("gallery_comment_mentions")
      .delete()
      .eq("comment_id", commentId)
      .in("mentioned_user_id", toRemove)
    if (error) {
      console.error("[gallery] failed to remove stale mentions", error)
    }
  }

  const toAdd = others.filter((profile) => !existingIds.has(profile.id))
  if (toAdd.length === 0) return

  const { error: mentionError } = await admin
    .from("gallery_comment_mentions")
    .insert(
      toAdd.map((profile) => ({
        comment_id: commentId,
        mentioned_user_id: profile.id,
      }))
    )
  if (mentionError) {
    console.error("[gallery] failed to save comment mentions", mentionError)
  }
}

export async function addGalleryComment(
  imageId: string,
  body: string,
  parentId?: string | null
): Promise<CommentActionResult<CreatedGalleryComment>> {
  const trimmed = body.trim()
  if (!imageId) return { ok: false, error: "Missing image id." }
  if (!trimmed) return { ok: false, error: "Comment cannot be empty." }
  if (trimmed.length > 1000) {
    return { ok: false, error: "Comment is too long (max 1000 chars)." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  let parentAuthorId: string | null = null
  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("gallery_comments")
      .select("id, image_id, created_by")
      .eq("id", parentId)
      .maybeSingle()
    if (parentError) {
      return { ok: false, error: `Comment failed: ${parentError.message}` }
    }
    if (!parent || parent.image_id !== imageId) {
      return { ok: false, error: "Invalid parent comment." }
    }
    parentAuthorId = parent.created_by
  }

  const { data, error } = await supabase
    .from("gallery_comments")
    .insert({
      image_id: imageId,
      parent_id: parentId ?? null,
      body: trimmed,
      created_by: userId,
    })
    .select("id, image_id, parent_id, body, created_by, created_at")
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: `Comment failed: ${error?.message ?? "Unknown error."}`,
    }
  }

  const admin = createAdminClient()

  if (parentAuthorId && parentAuthorId !== userId) {
    const { error: replyNotifyError } = await admin
      .from("gallery_activity_notifications")
      .insert({
        recipient_user_id: parentAuthorId,
        kind: "reply",
        image_id: imageId,
        comment_id: data.id,
        actor_user_id: userId,
        body: trimmed.slice(0, 200),
      })
    if (replyNotifyError && replyNotifyError.code !== "23505") {
      console.error(
        "[gallery] failed to save reply notification",
        replyNotifyError
      )
    }
  }

  const mentionNames = parseMentions(trimmed)
  if (mentionNames.length > 0) {
    await syncGalleryCommentMentions(admin, data.id, trimmed, userId)
  }

  revalidatePath("/", "layout")
  return {
    ok: true,
    data: {
      ...data,
      updated_at: null,
      pinned_at: null,
      like_count: 0,
      liked_by_me: false,
    },
  }
}

export async function updateGalleryComment(
  commentId: string,
  body: string
): Promise<CommentActionResult<CreatedGalleryComment>> {
  const trimmed = body.trim()
  if (!commentId) return { ok: false, error: "Missing comment id." }
  if (!trimmed) return { ok: false, error: "Comment cannot be empty." }
  if (trimmed.length > 1000) {
    return { ok: false, error: "Comment is too long (max 1000 chars)." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const updatedAt = new Date().toISOString()
  let data: CreatedGalleryComment | null = null
  let error: { code?: string; message?: string } | null = null

  const withUpdatedAt = await supabase
    .from("gallery_comments")
    .update({ body: trimmed, updated_at: updatedAt })
    .eq("id", commentId)
    .eq("created_by", userId)
    .select("id, image_id, parent_id, body, created_by, created_at, updated_at")
    .maybeSingle()

  data = withUpdatedAt.data as CreatedGalleryComment | null
  error = withUpdatedAt.error

  if (error && isGalleryCommentEditUnavailable(error)) {
    const fallback = await supabase
      .from("gallery_comments")
      .update({ body: trimmed })
      .eq("id", commentId)
      .eq("created_by", userId)
      .select("id, image_id, parent_id, body, created_by, created_at")
      .maybeSingle()

    if (fallback.error || !fallback.data) {
      return {
        ok: false,
        error: `Update failed: ${fallback.error?.message ?? "Comment edit is not available yet — apply the gallery comments update migration."}`,
      }
    }

    data = { ...fallback.data, updated_at: null }
    error = null
  }

  if (error || !data) {
    return {
      ok: false,
      error: `Update failed: ${error?.message ?? "Comment not found."}`,
    }
  }

  const admin = createAdminClient()
  await syncGalleryCommentMentions(admin, commentId, trimmed, userId)

  revalidatePath("/", "layout")
  return { ok: true, data }
}

export async function deleteGalleryComment(
  commentId: string
): Promise<CommentActionResult> {
  if (!commentId) return { ok: false, error: "Missing comment id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_comments")
    .delete()
    .eq("id", commentId)
    .eq("created_by", userId)

  if (error) {
    return { ok: false, error: `Delete failed: ${error.message}` }
  }

  revalidatePath("/")
  return { ok: true }
}

async function syncGalleryCommentLikeNotification(
  admin: ReturnType<typeof createAdminClient>,
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

export async function toggleGalleryCommentLike(
  commentId: string
): Promise<CommentActionResult<{ liked: boolean; like_count: number }>> {
  if (!commentId) return { ok: false, error: "Missing comment id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: existing, error: fetchError } = await supabase
    .from("gallery_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (fetchError) {
    if (
      fetchError.code === "42P01" ||
      /gallery_comment_likes/i.test(fetchError.message)
    ) {
      return {
        ok: false,
        error:
          "Comment likes are not available yet — apply the gallery comment likes migration.",
      }
    }
    return { ok: false, error: `Like failed: ${fetchError.message}` }
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from("gallery_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId)

    if (deleteError) {
      return { ok: false, error: `Like failed: ${deleteError.message}` }
    }

    const admin = createAdminClient()
    await syncGalleryCommentLikeNotification(admin, {
      commentId,
      actorUserId: userId,
      liked: false,
    })
  } else {
    const { error: insertError } = await supabase
      .from("gallery_comment_likes")
      .insert({ comment_id: commentId, user_id: userId })

    if (insertError) {
      return { ok: false, error: `Like failed: ${insertError.message}` }
    }

    const admin = createAdminClient()
    await syncGalleryCommentLikeNotification(admin, {
      commentId,
      actorUserId: userId,
      liked: true,
    })
  }

  const { count, error: countError } = await supabase
    .from("gallery_comment_likes")
    .select("comment_id", { count: "exact", head: true })
    .eq("comment_id", commentId)

  if (countError) {
    return { ok: false, error: `Like failed: ${countError.message}` }
  }

  revalidatePath("/", "layout")
  return {
    ok: true,
    data: { liked: !existing, like_count: count ?? 0 },
  }
}

export async function setGalleryCommentPin(
  commentId: string,
  pinned: boolean
): Promise<CommentActionResult<{ pinned_at: string | null }>> {
  if (!commentId) return { ok: false, error: "Missing comment id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }
  if (!profile?.is_admin) {
    return { ok: false, error: "Only super admins can pin comments." }
  }

  const { error } = await supabase.rpc("gallery_admin_set_comment_pin", {
    p_comment_id: commentId,
    p_pinned: pinned,
  })

  if (error) {
    if (/gallery_admin_set_comment_pin/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Comment pin is not available yet — apply the gallery comment pin migration.",
      }
    }
    return { ok: false, error: `Pin failed: ${error.message}` }
  }

  const pinnedAt = pinned ? new Date().toISOString() : null
  revalidatePath("/", "layout")
  return { ok: true, data: { pinned_at: pinnedAt } }
}

export async function setGalleryImagePin(
  imageId: string,
  pinned: boolean
): Promise<CommentActionResult<{ pinned_at: string | null }>> {
  if (!imageId) return { ok: false, error: "Missing image id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }
  if (!profile?.is_admin) {
    return { ok: false, error: "Only super admins can pin items on the wall." }
  }

  const { error } = await supabase.rpc("gallery_admin_set_image_pin", {
    p_image_id: imageId,
    p_pinned: pinned,
  })

  if (error) {
    if (/gallery_admin_set_image_pin/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Pin is not available yet — apply the gallery image pin migration.",
      }
    }
    return { ok: false, error: `Pin failed: ${error.message}` }
  }

  const pinnedAt = pinned ? new Date().toISOString() : null
  revalidatePath("/", "layout")
  revalidatePath("/upload")
  return { ok: true, data: { pinned_at: pinnedAt } }
}

export async function markGalleryActivityNotificationsRead(
  activityIds: string[]
): Promise<ReactionActionResult> {
  const uniqueIds = Array.from(
    new Set(activityIds.filter((id) => typeof id === "string" && id.length > 0))
  )
  if (uniqueIds.length === 0) return { ok: true }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_activity_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", userId)
    .in("id", uniqueIds)
    .is("read_at", null)

  if (error) {
    return {
      ok: false,
      error: `Could not mark notifications read: ${error.message}`,
    }
  }

  revalidatePath("/", "layout")
  revalidatePath("/upload")
  return { ok: true }
}

export async function markGalleryMentionsRead(
  commentIds: string[]
): Promise<ReactionActionResult> {
  const uniqueIds = Array.from(
    new Set(commentIds.filter((id) => typeof id === "string" && id.length > 0))
  )
  if (uniqueIds.length === 0) return { ok: true }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_comment_mentions")
    .update({ read_at: new Date().toISOString() })
    .eq("mentioned_user_id", userId)
    .in("comment_id", uniqueIds)
    .is("read_at", null)

  if (error) {
    return {
      ok: false,
      error: `Could not mark mentions read: ${error.message}`,
    }
  }

  revalidatePath("/", "layout")
  revalidatePath("/upload")
  return { ok: true }
}

export async function setGallerySeasonalTheme(
  themeId: GallerySeasonalThemeId | null
): Promise<ReactionActionResult> {
  if (themeId !== null && !isGallerySeasonalThemeId(themeId)) {
    return { ok: false, error: "Unknown theme." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }
  if (!profile?.is_admin) {
    return { ok: false, error: "Only super admins can change the site theme." }
  }

  const result = await setGallerySeasonalThemeId(supabase, themeId, userId)
  if (!result.ok) return result

  revalidatePath("/", "layout")
  revalidatePath("/upload")
  return { ok: true }
}
