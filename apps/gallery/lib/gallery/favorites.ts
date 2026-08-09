import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Migration not applied yet (or PostgREST schema cache miss) — fail quietly
 * so the wall still loads without a Next.js error overlay.
 */
export function isGalleryFavoritesUnavailable(
  error: {
    code?: string
    message?: string
  } | null
): boolean {
  if (!error) return false
  const code = error.code ?? ""
  const message = error.message ?? ""
  if (code === "PGRST205" || code === "PGRST202" || code === "42P01") {
    return true
  }
  if (/gallery_wall_cover_ids_for_favorites/i.test(message)) return true
  if (
    /gallery_favorites/i.test(message) &&
    (/schema cache/i.test(message) ||
      /does not exist/i.test(message) ||
      /could not find/i.test(message) ||
      /PGRST/i.test(message))
  ) {
    return true
  }
  return false
}

/** True when gallery_favorites is queryable (migration applied). */
export async function isGalleryFavoritesReady(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from("gallery_favorites")
    .select("image_id")
    .limit(1)
  if (!error) return true
  return !isGalleryFavoritesUnavailable(error)
}
