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
  } else if (existing) {
    const { error: updateError } = await supabase
      .from("gallery_image_votes")
      .update({ reaction })
      .eq("image_id", imageId)
      .eq("user_id", userId)

    if (updateError) {
      return { ok: false, error: `Reaction failed: ${updateError.message}` }
    }
  } else {
    const { error: insertError } = await supabase
      .from("gallery_image_votes")
      .insert({ image_id: imageId, user_id: userId, reaction })

    if (insertError) {
      return { ok: false, error: `Reaction failed: ${insertError.message}` }
    }

    const admin = createAdminClient()
    const { data: image } = await admin
      .from("gallery_images")
      .select("created_by")
      .eq("id", imageId)
      .maybeSingle()

    if (image?.created_by && image.created_by !== userId) {
      const { error: notifyError } = await admin
        .from("gallery_activity_notifications")
        .insert({
          recipient_user_id: image.created_by,
          kind: "reaction",
          image_id: imageId,
          actor_user_id: userId,
          reaction,
        })
      if (notifyError && notifyError.code !== "23505") {
        console.error(
          "[gallery] failed to save reaction notification",
          notifyError
        )
      }
    }
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
  return { ok: true, data: { ...data, updated_at: null } }
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
