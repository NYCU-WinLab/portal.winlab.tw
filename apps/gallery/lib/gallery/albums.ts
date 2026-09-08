import type { SupabaseClient } from "@supabase/supabase-js"

export const GALLERY_ALBUM_TITLE_MAX = 80
export const GALLERY_ALBUM_SLUG_MAX = 80
export const GALLERY_ALBUM_DESCRIPTION_MAX = 500
export const GALLERY_ALBUM_PHOTOS_MAX = 200

export type GalleryAlbumSummary = {
  id: string
  title: string
  slug: string
  description: string | null
  cover_image_path: string | null
  cover_media_type: "image" | "video" | null
  cover_poster_path: string | null
  photo_count: number
  created_by: string
  owner_name: string
  created_at: string
  updated_at: string
}

export type GalleryAlbumPhoto = {
  image_id: string
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
  uploader_name: string
  created_by: string | null
  created_at: string
  position: number
  added_at: string
  is_favorited?: boolean
}

export type GalleryAlbumDetail = {
  id: string
  title: string
  slug: string
  description: string | null
  cover_image_id: string | null
  created_by: string
  owner_name: string
  created_at: string
  updated_at: string
  photos: GalleryAlbumPhoto[]
}

/**
 * Normalize a free-form title into a URL-safe slug.
 * Returns null when nothing usable remains.
 */
export function normalizeGalleryAlbumSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, GALLERY_ALBUM_SLUG_MAX)

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  return slug
}

/** Trim + length-check a display title; slug is derived separately. */
export function normalizeGalleryAlbumTitle(raw: string): string | null {
  const title = raw.trim().replace(/\s+/g, " ")
  if (!title || title.length > GALLERY_ALBUM_TITLE_MAX) return null
  if (!normalizeGalleryAlbumSlug(title)) return null
  return title
}

export function normalizeGalleryAlbumDescription(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null
  const text = raw.trim().replace(/\s+/g, " ")
  if (!text) return null
  if (text.length > GALLERY_ALBUM_DESCRIPTION_MAX) return null
  return text
}

/** Dedupe + cap image ids for bulk album membership mutations. */
export function normalizeGalleryAlbumImageIds(imageIds: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of imageIds) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    ordered.push(trimmed)
    if (ordered.length >= GALLERY_ALBUM_PHOTOS_MAX) break
  }
  return ordered
}

/** Assign contiguous positions 0..n-1 for a reorder payload. */
export function normalizeAlbumPositions(
  imageIds: string[]
): { image_id: string; position: number }[] {
  return normalizeGalleryAlbumImageIds(imageIds).map((image_id, position) => ({
    image_id,
    position,
  }))
}

/**
 * Migration / PostgREST schema-cache miss for album RPCs — fail quietly so the
 * wall still loads (and actions can soft-fall back to direct table writes).
 */
export function isGalleryAlbumsUnavailable(
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
  if (
    /gallery_wall_cover_ids_for_album|gallery_album_add_images|gallery_album_remove_images|gallery_album_reorder_images|gallery_list_albums|gallery_album_photos/i.test(
      message
    )
  ) {
    return true
  }
  if (
    /gallery_albums|gallery_album_images|gallery_album_photos/i.test(message) &&
    (/schema cache/i.test(message) ||
      /does not exist/i.test(message) ||
      /could not find/i.test(message) ||
      /PGRST/i.test(message))
  ) {
    return true
  }
  return false
}

/** True when gallery_albums is queryable (migration applied). */
export async function isGalleryAlbumsReady(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase.from("gallery_albums").select("id").limit(1)
  if (!error) return true
  return !isGalleryAlbumsUnavailable(error)
}

/** After bulk remove, keep cover pointing at a remaining photo (or null). */
export function nextAlbumCoverAfterRemove(
  coverImageId: string | null | undefined,
  remainingImageIds: string[],
  removedIds: string[]
): string | null {
  const cover = coverImageId ?? null
  if (cover == null) return null
  if (!removedIds.includes(cover)) return cover
  return remainingImageIds[0] ?? null
}

/** Case-insensitive match across title, slug, description, and owner. */
export function albumMatchesQuery(
  album: {
    title: string
    slug: string
    description: string | null
    owner_name: string
  },
  query: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    album.title.toLowerCase().includes(needle) ||
    album.slug.includes(needle) ||
    (album.description?.toLowerCase().includes(needle) ?? false) ||
    album.owner_name.toLowerCase().includes(needle)
  )
}
