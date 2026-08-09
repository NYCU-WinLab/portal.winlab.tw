export const GALLERY_SLIDESHOW_DEFAULT_MS = 4000
export const GALLERY_SLIDESHOW_MIN_MS = 1500
export const GALLERY_SLIDESHOW_MAX_MS = 15000

/** Minimal photo shape for fullscreen slideshow (albums + memories). */
export type GallerySlideshowPhoto = {
  image_id: string
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
}

/** Clamp slideshow interval into a human-friendly range. */
export function clampSlideshowIntervalMs(raw: number): number {
  if (!Number.isFinite(raw)) return GALLERY_SLIDESHOW_DEFAULT_MS
  return Math.min(
    GALLERY_SLIDESHOW_MAX_MS,
    Math.max(GALLERY_SLIDESHOW_MIN_MS, Math.round(raw))
  )
}

/** Wrap to next index; empty list stays at 0. */
export function nextSlideshowIndex(current: number, length: number): number {
  if (length <= 0) return 0
  const safe = ((current % length) + length) % length
  return (safe + 1) % length
}

/** Wrap to previous index; empty list stays at 0. */
export function prevSlideshowIndex(current: number, length: number): number {
  if (length <= 0) return 0
  const safe = ((current % length) + length) % length
  return (safe - 1 + length) % length
}

/** Flatten year groups into slideshow order (newest year first). */
export function flattenMemoryGroupsForSlideshow(
  groups: Array<{
    photos: Array<{
      id: string
      name: string
      image_path: string
      media_type: "image" | "video"
      poster_path: string | null
    }>
  }>
): GallerySlideshowPhoto[] {
  return groups.flatMap((group) =>
    group.photos.map((photo) => ({
      image_id: photo.id,
      name: photo.name,
      image_path: photo.image_path,
      media_type: photo.media_type,
      poster_path: photo.poster_path,
    }))
  )
}
