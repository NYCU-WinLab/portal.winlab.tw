/** Fisher–Yates shuffle — returns a new array; original order untouched. */
export function shuffleGalleryWallOrder<T>(items: readonly T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = next[i]!
    next[i] = next[j]!
    next[j] = a
  }
  return next
}

/**
 * Append a newly fetched page. When the wall is shuffled, insert each fresh
 * item at a random index so chronological tails don't pile up at the bottom.
 */
export function mergeGalleryWallPage<T extends { id: string }>(
  prev: readonly T[],
  incoming: readonly T[],
  shuffled: boolean
): { images: T[]; addedIds: string[] } {
  const seen = new Set(prev.map((item) => item.id))
  const fresh = incoming.filter((item) => !seen.has(item.id))
  if (fresh.length === 0) {
    return { images: [...prev], addedIds: [] }
  }
  if (!shuffled) {
    return {
      images: [...prev, ...fresh],
      addedIds: fresh.map((item) => item.id),
    }
  }

  const next = [...prev]
  for (const item of fresh) {
    const index = Math.floor(Math.random() * (next.length + 1))
    next.splice(index, 0, item)
  }
  return { images: next, addedIds: fresh.map((item) => item.id) }
}

/** Restore display order from the stable load-order id list. */
export function restoreGalleryWallOrder<T extends { id: string }>(
  images: readonly T[],
  loadOrderIds: readonly string[]
): T[] {
  const byId = new Map(images.map((item) => [item.id, item]))
  const ordered: T[] = []
  const used = new Set<string>()

  for (const id of loadOrderIds) {
    const item = byId.get(id)
    if (!item || used.has(id)) continue
    ordered.push(item)
    used.add(id)
  }

  for (const item of images) {
    if (used.has(item.id)) continue
    ordered.push(item)
  }

  return ordered
}
