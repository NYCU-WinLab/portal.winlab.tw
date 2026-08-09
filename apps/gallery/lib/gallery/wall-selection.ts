/**
 * Pure helpers for wall multi-select → bulk album add.
 */

/** Toggle membership of `id` in a selection set (immutable). */
export function toggleWallSelection(
  selected: ReadonlySet<string>,
  id: string
): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Select all ids, or clear when every id is already selected. */
export function toggleSelectAllWallIds(
  selected: ReadonlySet<string>,
  allIds: readonly string[]
): Set<string> {
  if (allIds.length === 0) return new Set()
  const everySelected = allIds.every((id) => selected.has(id))
  if (everySelected) return new Set()
  return new Set(allIds)
}

/** Ordered intersection of wall order ∩ selection (stable for bulk RPC). */
export function orderedSelectedWallIds(
  wallOrderIds: readonly string[],
  selected: ReadonlySet<string>
): string[] {
  if (selected.size === 0) return []
  return wallOrderIds.filter((id) => selected.has(id))
}

export function describeWallSelectionCount(count: number): string {
  if (count <= 0) return "Nothing selected"
  if (count === 1) return "1 photo selected"
  return `${count} photos selected`
}
