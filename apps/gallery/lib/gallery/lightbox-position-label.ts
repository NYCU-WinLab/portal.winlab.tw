/** DialogTitle / live-region label for album or Memories lightbox. */
export function describeAlbumLightboxPositionLabel(
  name: string,
  index: number,
  total: number
): string {
  const safeName = name.trim() || "Untitled"
  if (total <= 1) return safeName
  const position = Math.min(Math.max(index, 0), total - 1) + 1
  const edge = position === 1 ? " · first" : position === total ? " · last" : ""
  return `${safeName} · ${position} of ${total}${edge}`
}
