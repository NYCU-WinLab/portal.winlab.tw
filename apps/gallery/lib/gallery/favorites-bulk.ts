/**
 * Pure helpers for bulk favorites mutations from wall select.
 */

export const GALLERY_FAVORITES_BULK_MAX = 200

/** Dedupe + trim + cap image ids for bulk favorite writes. */
export function normalizeGalleryFavoriteImageIds(imageIds: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of imageIds) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    ordered.push(trimmed)
    if (ordered.length >= GALLERY_FAVORITES_BULK_MAX) break
  }
  return ordered
}

export function describeBulkFavoriteResult(
  favorited: boolean,
  changed: number
): string {
  if (changed <= 0) {
    return favorited
      ? "Already saved — nothing new"
      : "None of those were saved"
  }
  if (favorited) {
    return changed === 1
      ? "Saved 1 photo to favorites"
      : `Saved ${changed} photos to favorites`
  }
  return changed === 1
    ? "Removed 1 photo from favorites"
    : `Removed ${changed} photos from favorites`
}
