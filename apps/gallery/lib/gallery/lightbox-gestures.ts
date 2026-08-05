export type LightboxSwipe = "prev" | "next" | "up" | "down" | null

/** Resolve a touch delta into a lightbox swipe direction. */
export function resolveLightboxSwipe(
  deltaX: number,
  deltaY: number,
  threshold = 48
): LightboxSwipe {
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  if (absX < threshold && absY < threshold) return null

  if (absX > absY) {
    return deltaX > 0 ? "prev" : "next"
  }
  return deltaY < 0 ? "up" : "down"
}
