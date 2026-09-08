/** Live-region copy after a successful sequence/album reorder. */
export function describeSequenceReorderAnnouncement(
  name: string,
  toIndex: number,
  total: number
): string {
  const safeName = name.trim() || "Untitled"
  if (total <= 0) return `Moved ${safeName}`
  const position = Math.min(Math.max(toIndex, 0), total - 1) + 1
  return `Moved ${safeName} to position ${position} of ${total}`
}
