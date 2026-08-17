/**
 * Rank wall covers for an active search query (title beats tags).
 * Lower score = better match. Used to order pages when `?q=` is set.
 */

export type GallerySearchRankable = {
  id: string
  name: string
  tags?: Array<{ name: string; slug: string }> | null
  sequence_items?: Array<{
    tags?: Array<{ name: string; slug: string }> | null
  }>
  pinned_at?: string | null
  created_at: string
}

function normalizeNeedle(query: string): string {
  return query.trim().toLowerCase()
}

function tagsForImage(image: GallerySearchRankable): string[] {
  const values: string[] = []
  for (const tag of image.tags ?? []) {
    values.push(tag.name, tag.slug)
  }
  for (const item of image.sequence_items ?? []) {
    for (const tag of item.tags ?? []) {
      values.push(tag.name, tag.slug)
    }
  }
  return values.map((value) => value.toLowerCase())
}

/** 0 exact title · 1 title prefix · 2 title contains · 3 tag · 4 weak */
export function gallerySearchMatchScore(
  image: GallerySearchRankable,
  query: string
): number {
  const needle = normalizeNeedle(query)
  if (!needle) return 4
  const title = image.name.trim().toLowerCase()
  if (title === needle) return 0
  if (title.startsWith(needle)) return 1
  if (title.includes(needle)) return 2
  const tags = tagsForImage(image)
  if (tags.some((tag) => tag === needle || tag.includes(needle))) return 3
  return 4
}

export function compareGallerySearchRank(
  a: GallerySearchRankable,
  b: GallerySearchRankable,
  query: string
): number {
  const scoreDiff =
    gallerySearchMatchScore(a, query) - gallerySearchMatchScore(b, query)
  if (scoreDiff !== 0) return scoreDiff
  const aPinned = a.pinned_at ? 1 : 0
  const bPinned = b.pinned_at ? 1 : 0
  if (aPinned !== bPinned) return bPinned - aPinned
  const byDate = b.created_at.localeCompare(a.created_at)
  if (byDate !== 0) return byDate
  return a.id.localeCompare(b.id)
}

export function rankGallerySearchResults<T extends GallerySearchRankable>(
  images: readonly T[],
  query: string | null | undefined
): T[] {
  const needle = query?.trim()
  if (!needle || images.length < 2) return [...images]
  return [...images].sort((a, b) => compareGallerySearchRank(a, b, needle))
}

/** SQL-side rank bands mirrored in gallery_wall_cover_ids_for_query. */
export function sqlSearchRankBand(
  kind: "exact" | "prefix" | "title" | "tag"
): number {
  switch (kind) {
    case "exact":
      return 0
    case "prefix":
      return 1
    case "title":
      return 2
    case "tag":
      return 3
  }
}
