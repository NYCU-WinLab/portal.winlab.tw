"use server"

import { revalidatePath } from "next/cache"

import {
  describeBulkFavoriteResult,
  normalizeGalleryFavoriteImageIds,
} from "@/lib/gallery/favorites-bulk"
import { isGalleryFavoritesUnavailable } from "@/lib/gallery/favorites"
import { createClient } from "@/lib/supabase/server"

export type FavoriteActionResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string }

export type BulkFavoriteActionResult =
  | { ok: true; favorited: boolean; changed: number; message: string }
  | { ok: false; error: string }

export async function toggleGalleryFavorite(
  imageId: string,
  favorited: boolean
): Promise<FavoriteActionResult> {
  const result = await setGalleryFavorites([imageId], favorited)
  if (!result.ok) return result
  return { ok: true, favorited: result.favorited }
}

export async function setGalleryFavorites(
  imageIds: string[],
  favorited: boolean
): Promise<BulkFavoriteActionResult> {
  const ids = normalizeGalleryFavoriteImageIds(imageIds)
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one photo." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  if (favorited) {
    const rows = ids.map((image_id) => ({ user_id: userId, image_id }))
    const { data, error } = await supabase
      .from("gallery_favorites")
      .upsert(rows, {
        onConflict: "user_id,image_id",
        ignoreDuplicates: true,
      })
      .select("image_id")

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

    // ignoreDuplicates: true → PostgREST may return only newly inserted rows.
    const changed = data?.length ?? 0
    revalidatePath("/")
    return {
      ok: true,
      favorited: true,
      changed,
      message: describeBulkFavoriteResult(true, changed),
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("gallery_favorites")
    .select("image_id")
    .eq("user_id", userId)
    .in("image_id", ids)

  if (existingError) {
    if (isGalleryFavoritesUnavailable(existingError)) {
      return {
        ok: false,
        error:
          "Favorites are not available yet — apply the gallery favorites migration.",
      }
    }
    return { ok: false, error: existingError.message }
  }

  const removable = (existing ?? []).map((row) => row.image_id)
  if (removable.length === 0) {
    return {
      ok: true,
      favorited: false,
      changed: 0,
      message: describeBulkFavoriteResult(false, 0),
    }
  }

  const { error } = await supabase
    .from("gallery_favorites")
    .delete()
    .eq("user_id", userId)
    .in("image_id", removable)

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

  revalidatePath("/")
  return {
    ok: true,
    favorited: false,
    changed: removable.length,
    message: describeBulkFavoriteResult(false, removable.length),
  }
}
