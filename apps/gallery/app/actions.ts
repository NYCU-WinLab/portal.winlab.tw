"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type VoteActionResult = { ok: true } | { ok: false; error: string }

export async function voteGalleryImage(
  imageId: string
): Promise<VoteActionResult> {
  if (!imageId) return { ok: false, error: "Missing image id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_image_votes")
    .insert({ image_id: imageId, user_id: userId })

  if (error) {
    // Unique violation means this user already voted for this image.
    if (error.code === "23505") {
      return { ok: false, error: "You already voted for this work." }
    }
    return { ok: false, error: `Vote failed: ${error.message}` }
  }

  revalidatePath("/")
  return { ok: true }
}

export async function unvoteGalleryImage(
  imageId: string
): Promise<VoteActionResult> {
  if (!imageId) return { ok: false, error: "Missing image id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_image_votes")
    .delete()
    .eq("image_id", imageId)
    .eq("user_id", userId)

  if (error) {
    return { ok: false, error: `Unvote failed: ${error.message}` }
  }

  revalidatePath("/")
  return { ok: true }
}
