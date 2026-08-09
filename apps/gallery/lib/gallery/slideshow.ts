export const GALLERY_SLIDESHOW_DEFAULT_MS = 4000
export const GALLERY_SLIDESHOW_MIN_MS = 1500
export const GALLERY_SLIDESHOW_MAX_MS = 15000

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
