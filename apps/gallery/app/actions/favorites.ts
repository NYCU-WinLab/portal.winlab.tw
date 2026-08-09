"use server"

import { revalidatePath } from "next/cache"

import { isGalleryFavoritesUnavailable } from "@/lib/gallery/favorites"
import { createClient } from "@/lib/supabase/server"

export type FavoriteActionResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string }

export async function toggleGalleryFavorite(
  imageId: string,
  favorited: boolean
): Promise<FavoriteActionResult> {
  const id = imageId.trim()
  if (!id) return { ok: false, error: "Missing photo." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  if (favorited) {
    const { error } = await supabase
      .from("gallery_favorites")
      .upsert(
        { user_id: userId, image_id: id },
        { onConflict: "user_id,image_id", ignoreDuplicates: true }
      )
    if (error) {
      if (isGalleryFavoritesUnavailable(error)) {
        return {
          ok: false,
          error:
            "Favorites are not available yet — apply the gallery favorites migration.",
        }
      }
      return { ok: false, error: error.message }
    }
  } else {
    const { error } = await supabase
      .from("gallery_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("image_id", id)
    if (error) {
      if (isGalleryFavoritesUnavailable(error)) {
        return {
          ok: false,
          error:
            "Favorites are not available yet — apply the gallery favorites migration.",
        }
      }
      return { ok: false, error: error.message }
    }
  }

  revalidatePath("/")
  return { ok: true, favorited }
}
