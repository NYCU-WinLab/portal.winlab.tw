/** Step a linear focus index without wrapping (wall / album / Memories). */
export function stepFocusIndex(
  current: number,
  length: number,
  delta: number
): number {
  if (length <= 0) return -1
  if (current < 0) return delta >= 0 ? 0 : length - 1
  return Math.min(length - 1, Math.max(0, current + delta))
}
