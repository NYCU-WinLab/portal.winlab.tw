/** Polite live-region copy when keyboard focus moves across a photo list. */
export function describeFocusedPhotoAnnouncement(
  name: string,
  index: number,
  total: number
): string {
  const safeName = name.trim() || "Untitled"
  if (total <= 0) return safeName
  const position = Math.min(Math.max(index, 0), total - 1) + 1
  return `${safeName}, ${position} of ${total}`
}

/** Manage Select row focus announcement (same shape as the wall). */
export function describeFocusedManageRowAnnouncement(
  name: string,
  index: number,
  total: number
): string {
  return describeFocusedPhotoAnnouncement(name, index, total)
}
