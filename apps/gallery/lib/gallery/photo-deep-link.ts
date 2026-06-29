import type { SupabaseClient } from "@supabase/supabase-js"

import { GALLERY_PAGE_SIZE } from "@/lib/gallery/load-home-page"

export function galleryPhotoPageFromRank(
  rank: number,
  pageSize = GALLERY_PAGE_SIZE
): number {
  if (!Number.isFinite(rank) || rank < 1) return 1
  return Math.max(1, Math.ceil(rank / pageSize))
}

type ImageRow = {
  id: string
  created_at: string
  sequence_id: string | null
  sequence_index: number | null
}

export type GalleryPhotoDeepLink = {
  coverId: string
  page: number
}

/** Resolve a photo id to its wall cover row and 1-based pagination page. */
export async function resolveGalleryPhotoDeepLink(
  supabase: SupabaseClient,
  photoId: string
): Promise<GalleryPhotoDeepLink | null> {
  const { data: row, error } = await supabase
    .from("gallery_images")
    .select("id, created_at, sequence_id, sequence_index")
    .eq("id", photoId)
    .maybeSingle()

  if (error || !row) {
    if (error) {
      console.error("[gallery] failed to resolve photo deep link", error)
    }
    return null
  }

  const image = row as ImageRow
  let coverId = image.id
  let sortCreatedAt = image.created_at

  if (
    image.sequence_id &&
    typeof image.sequence_index === "number" &&
    image.sequence_index !== 0
  ) {
    const { data: cover } = await supabase
      .from("gallery_images")
      .select("id, created_at")
      .eq("sequence_id", image.sequence_id)
      .eq("sequence_index", 0)
      .maybeSingle()

    if (cover) {
      coverId = cover.id
      sortCreatedAt = cover.created_at
    }
  }

  const { count, error: countError } = await supabase
    .from("gallery_images")
    .select("id", { count: "exact", head: true })
    .or("sequence_id.is.null,sequence_index.eq.0")
    .gt("created_at", sortCreatedAt)

  if (countError) {
    console.error("[gallery] failed to count newer wall photos", countError)
    return { coverId, page: 1 }
  }

  const page = galleryPhotoPageFromRank((count ?? 0) + 1)
  return { coverId, page }
}

export function buildGalleryPhotoHref({
  photoId,
  commentId,
  page,
}: {
  photoId: string
  commentId?: string | null
  page?: number | null
}): string {
  const params = new URLSearchParams()
  if (page && page > 1) params.set("page", String(page))
  params.set("photo", photoId)
  if (commentId) params.set("comment", commentId)
  const qs = params.toString()
  return qs ? `/?${qs}` : "/"
}
