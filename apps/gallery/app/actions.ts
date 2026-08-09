"use server"

import { revalidatePath } from "next/cache"

import {
  type GalleryReaction,
  isGalleryReaction,
  isGalleryReactionsUnavailable,
} from "@/lib/gallery/reactions"
import {
  isGalleryCommentEditUnavailable,
  isGalleryCommentsUnavailable,
} from "@/lib/gallery/comment-edit"
import { isGalleryCommentLikesUnavailable } from "@/lib/gallery/comment-social"
import {
  describeBulkPinResult,
  normalizeGalleryPinImageIds,
} from "@/lib/gallery/bulk-pin"
import { isGalleryPinnedAtUnavailable } from "@/lib/gallery/manage-uploads"
import {
  isActivityNotificationsUnavailable,
  isGalleryMentionsTableUnavailable,
} from "@/lib/gallery/notifications"
import {
  type GallerySeasonalThemeId,
  isGallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"
import { setGallerySeasonalThemeId } from "@/lib/gallery/settings"
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
    if (isGalleryReactionsUnavailable(fetchError)) {
      return {
        ok: false,
        error:
          "Reactions are not available yet — apply the gallery reactions migration.",
      }
    }
    return { ok: false, error: `Reaction failed: ${fetchError.message}` }
  }

  // Notification fan-out lives in gallery_notify_on_reaction (DB trigger).
  if (existing?.reaction === reaction) {
    const { error: deleteError } = await supabase
      .from("gallery_image_votes")
      .delete()
      .eq("image_id", imageId)
      .eq("user_id", userId)

    if (deleteError) {
      if (isGalleryReactionsUnavailable(deleteError)) {
        return {
          ok: false,
          error:
            "Reactions are not available yet — apply the gallery reactions migration.",
        }
      }
      return { ok: false, error: `Reaction failed: ${deleteError.message}` }
    }
  } else if (existing) {
    const { error: updateError } = await supabase
      .from("gallery_image_votes")
      .update({ reaction })
      .eq("image_id", imageId)
      .eq("user_id", userId)

    if (updateError) {
      if (isGalleryReactionsUnavailable(updateError)) {
        return {
          ok: false,
          error:
            "Reactions are not available yet — apply the gallery reactions migration.",
        }
      }
      return { ok: false, error: `Reaction failed: ${updateError.message}` }
    }
  } else {
    const { error: insertError } = await supabase
      .from("gallery_image_votes")
      .insert({ image_id: imageId, user_id: userId, reaction })

    if (insertError) {
      if (isGalleryReactionsUnavailable(insertError)) {
        return {
          ok: false,
          error:
            "Reactions are not available yet — apply the gallery reactions migration.",
        }
      }
      return { ok: false, error: `Reaction failed: ${insertError.message}` }
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
  pinned_at?: string | null
  like_count?: number
  liked_by_me?: boolean
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

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("gallery_comments")
      .select("id, image_id")
      .eq("id", parentId)
      .maybeSingle()
    if (parentError) {
      if (isGalleryCommentsUnavailable(parentError)) {
        return {
          ok: false,
          error:
            "Comments are not available yet — apply the gallery comments migration.",
        }
      }
      return { ok: false, error: `Comment failed: ${parentError.message}` }
    }
    if (!parent || parent.image_id !== imageId) {
      return { ok: false, error: "Invalid parent comment." }
    }
  }

  // Reply + @mention fan-out lives in gallery_notify_on_comment (DB trigger).
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
    if (isGalleryCommentsUnavailable(error)) {
      return {
        ok: false,
        error:
          "Comments are not available yet — apply the gallery comments migration.",
      }
    }
    return {
      ok: false,
      error: `Comment failed: ${error?.message ?? "Unknown error."}`,
    }
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
      if (isGalleryCommentsUnavailable(fallback.error)) {
        return {
          ok: false,
          error:
            "Comments are not available yet — apply the gallery comments migration.",
        }
      }
      return {
        ok: false,
        error: `Update failed: ${fallback.error?.message ?? "Comment edit is not available yet — apply the gallery comments update migration."}`,
      }
    }

    data = { ...fallback.data, updated_at: null }
    error = null
  }

  if (error || !data) {
    if (isGalleryCommentsUnavailable(error)) {
      return {
        ok: false,
        error:
          "Comments are not available yet — apply the gallery comments migration.",
      }
    }
    return {
      ok: false,
      error: `Update failed: ${error?.message ?? "Comment not found."}`,
    }
  }

  // Mention re-sync lives in gallery_notify_on_comment (DB trigger on body).
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
    if (isGalleryCommentsUnavailable(error)) {
      return {
        ok: false,
        error:
          "Comments are not available yet — apply the gallery comments migration.",
      }
    }
    return { ok: false, error: `Delete failed: ${error.message}` }
  }

  revalidatePath("/")
  return { ok: true }
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
    if (isGalleryCommentLikesUnavailable(fetchError)) {
      return {
        ok: false,
        error:
          "Comment likes are not available yet — apply the gallery comment likes migration.",
      }
    }
    return { ok: false, error: `Like failed: ${fetchError.message}` }
  }

  // Comment-like notification fan-out lives in gallery_notify_on_comment_like.
  if (existing) {
    const { error: deleteError } = await supabase
      .from("gallery_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId)

    if (deleteError) {
      if (isGalleryCommentLikesUnavailable(deleteError)) {
        return {
          ok: false,
          error:
            "Comment likes are not available yet — apply the gallery comment likes migration.",
        }
      }
      return { ok: false, error: `Like failed: ${deleteError.message}` }
    }
  } else {
    const { error: insertError } = await supabase
      .from("gallery_comment_likes")
      .insert({ comment_id: commentId, user_id: userId })

    if (insertError) {
      if (isGalleryCommentLikesUnavailable(insertError)) {
        return {
          ok: false,
          error:
            "Comment likes are not available yet — apply the gallery comment likes migration.",
        }
      }
      return { ok: false, error: `Like failed: ${insertError.message}` }
    }
  }

  const { count, error: countError } = await supabase
    .from("gallery_comment_likes")
    .select("comment_id", { count: "exact", head: true })
    .eq("comment_id", commentId)

  if (countError) {
    if (isGalleryCommentLikesUnavailable(countError)) {
      return {
        ok: false,
        error:
          "Comment likes are not available yet — apply the gallery comment likes migration.",
      }
    }
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
  const result = await setGalleryImagesPin([imageId], pinned)
  if (!result.ok) return result
  if (result.data.ok === 0) {
    return {
      ok: false,
      error: result.data.failed
        ? "Pin failed for that photo."
        : "Missing image id.",
    }
  }
  return {
    ok: true,
    data: { pinned_at: pinned ? new Date().toISOString() : null },
  }
}

export async function setGalleryImagesPin(
  imageIds: string[],
  pinned: boolean
): Promise<
  CommentActionResult<{ ok: number; failed: number; message: string }>
> {
  const ids = normalizeGalleryPinImageIds(imageIds)
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one photo." }
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
    return { ok: false, error: "Only super admins can pin items on the wall." }
  }

  let okCount = 0
  let failed = 0
  let firstError: string | null = null

  for (const imageId of ids) {
    const { error } = await supabase.rpc("gallery_admin_set_image_pin", {
      p_image_id: imageId,
      p_pinned: pinned,
    })

    if (error) {
      if (
        /gallery_admin_set_image_pin/i.test(error.message) ||
        isGalleryPinnedAtUnavailable(error)
      ) {
        return {
          ok: false,
          error:
            "Pin is not available yet — apply the gallery image pin migration.",
        }
      }
      failed += 1
      firstError ??= error.message
      continue
    }
    okCount += 1
  }

  if (okCount === 0) {
    return {
      ok: false,
      error: firstError ? `Pin failed: ${firstError}` : "Pin failed.",
    }
  }

  revalidatePath("/", "layout")
  revalidatePath("/upload")
  return {
    ok: true,
    data: {
      ok: okCount,
      failed,
      message: describeBulkPinResult({ pinned, ok: okCount, failed }),
    },
  }
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
    if (isActivityNotificationsUnavailable(error)) {
      return {
        ok: false,
        error:
          "Notifications are not available yet — apply the gallery activity notifications migration.",
      }
    }
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
    if (isGalleryMentionsTableUnavailable(error)) {
      return {
        ok: false,
        error:
          "Mentions are not available yet — apply the gallery comment mentions migration.",
      }
    }
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
