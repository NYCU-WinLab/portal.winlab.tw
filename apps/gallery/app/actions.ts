"use server"

import { revalidatePath } from "next/cache"

import {
  type GalleryReaction,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import { createClient } from "@/lib/supabase/server"

export type ReactionActionResult = { ok: true } | { ok: false; error: string }

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
