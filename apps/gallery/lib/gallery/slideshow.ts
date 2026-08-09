import { readStorageItem, writeStorageItem } from "@/lib/gallery/safe-storage"

export const GALLERY_SLIDESHOW_DEFAULT_MS = 4000
export const GALLERY_SLIDESHOW_MIN_MS = 1500
export const GALLERY_SLIDESHOW_MAX_MS = 15000
export const GALLERY_SLIDESHOW_INTERVAL_STORAGE_KEY =
  "gallery.slideshow.intervalMs"

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

/** Read a previously chosen interval from storage (clamped). */
export function readStoredSlideshowIntervalMs(
  storage: Pick<Storage, "getItem"> | null | undefined
): number {
  const raw = readStorageItem(storage, GALLERY_SLIDESHOW_INTERVAL_STORAGE_KEY)
  if (raw == null || raw === "") return GALLERY_SLIDESHOW_DEFAULT_MS
  return clampSlideshowIntervalMs(Number(raw))
}

/** Persist an interval preference; returns the clamped value written. */
export function writeStoredSlideshowIntervalMs(
  ms: number,
  storage: Pick<Storage, "setItem"> | null | undefined
): number {
  const clamped = clampSlideshowIntervalMs(ms)
  writeStorageItem(
    storage,
    GALLERY_SLIDESHOW_INTERVAL_STORAGE_KEY,
    String(clamped)
  )
  return clamped
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

/** Clamp a slideshow start index into [0, length). */
export function clampSlideshowStartIndex(
  startIndex: number,
  length: number
): number {
  if (length <= 0) return 0
  if (!Number.isFinite(startIndex)) return 0
  return Math.min(Math.max(0, Math.trunc(startIndex)), length - 1)
}

/** Map a 0–1 scrubber ratio to a slide index. */
export function slideshowIndexFromProgress(
  ratio: number,
  length: number
): number {
  if (length <= 0) return 0
  if (!Number.isFinite(ratio)) return 0
  const clamped = Math.min(1, Math.max(0, ratio))
  if (clamped >= 1) return length - 1
  return Math.floor(clamped * length)
}

/**
 * Jump helpers for digit keys: 1–9 → ~10%…90%, 0 → last slide.
 * Returns null when the key is not a digit jump.
 */
export function slideshowIndexFromDigitKey(
  key: string,
  length: number
): number | null {
  if (length <= 0) return null
  if (key === "0") return length - 1
  if (!/^[1-9]$/.test(key)) return null
  const digit = Number(key)
  return slideshowIndexFromProgress(digit / 10, length)
}

/** Find a slideshow photo by image id; missing → 0. */
export function findSlideshowIndexByImageId(
  photos: Array<{ image_id: string }>,
  imageId: string
): number {
  const index = photos.findIndex((photo) => photo.image_id === imageId)
  return index >= 0 ? index : 0
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

/** Map wall multi-select covers to slideshow photos (wall order). */
export function wallSelectionToSlideshowPhotos(
  orderedSelectedIds: string[],
  images: Array<{
    id: string
    name: string
    image_path: string
    media_type: "image" | "video"
    poster_path: string | null
  }>
): GallerySlideshowPhoto[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const photos: GallerySlideshowPhoto[] = []
  for (const id of orderedSelectedIds) {
    const image = byId.get(id)
    if (!image?.image_path) continue
    photos.push({
      image_id: image.id,
      name: image.name,
      image_path: image.image_path,
      media_type: image.media_type,
      poster_path: image.poster_path,
    })
  }
  return photos
}

/**
 * Like wallSelectionToSlideshowPhotos, but multi-shot sequences expand to
 * every sibling (story order) — same expansion shape as ZIP.
 */
export function expandWallSelectionSlideshowPhotos(
  orderedSelectedIds: string[],
  images: Array<{
    id: string
    name: string
    image_path: string
    media_type: "image" | "video"
    poster_path: string | null
    sequence_count: number
    sequence_items: Array<{
      id: string
      name: string
      image_path: string
      media_type: "image" | "video"
      poster_path: string | null
    }>
  }>
): GallerySlideshowPhoto[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const photos: GallerySlideshowPhoto[] = []

  for (const id of orderedSelectedIds) {
    const image = byId.get(id)
    if (!image) continue

    const siblings =
      image.sequence_count > 1 && image.sequence_items.length > 0
        ? image.sequence_items
        : null

    if (siblings) {
      for (const shot of siblings) {
        if (!shot.image_path) continue
        photos.push({
          image_id: shot.id,
          name: shot.name,
          image_path: shot.image_path,
          media_type: shot.media_type,
          poster_path: shot.poster_path,
        })
      }
      continue
    }

    if (!image.image_path) continue
    photos.push({
      image_id: image.id,
      name: image.name,
      image_path: image.image_path,
      media_type: image.media_type,
      poster_path: image.poster_path,
    })
  }

  return photos
}

/** Fisher–Yates shuffle of slideshow photos (does not mutate input). */
export function shuffleSlideshowPhotos(
  photos: GallerySlideshowPhoto[],
  random: () => number = Math.random
): GallerySlideshowPhoto[] {
  const next = [...photos]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = next[i]!
    next[i] = next[j]!
    next[j] = tmp
  }
  return next
}
