"use server"

import { revalidatePath } from "next/cache"

import {
  type GalleryReaction,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import { parseMentions } from "@/lib/gallery/mentions"
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
      return { ok: false, error: `Comment failed: ${parentError.message}` }
    }
    if (!parent || parent.image_id !== imageId) {
      return { ok: false, error: "Invalid parent comment." }
    }
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

  const mentionNames = parseMentions(trimmed)
  if (mentionNames.length > 0) {
    const admin = createAdminClient()
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, name")
      .in("name", mentionNames)

    const others = (profiles ?? []).filter((p) => p.id !== userId)
    if (others.length > 0) {
      const { error: mentionError } = await admin
        .from("gallery_comment_mentions")
        .insert(
          others.map((u) => ({
            comment_id: data.id,
            mentioned_user_id: u.id,
          }))
        )
      if (mentionError) {
        console.error("[gallery] failed to save comment mentions", mentionError)
      }
    }
  }

  revalidatePath("/")
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
