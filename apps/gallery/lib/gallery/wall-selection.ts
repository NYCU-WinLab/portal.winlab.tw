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

/** Toggle label for wall multi-select mode. */
export function describeWallSelectModeLabel(selectionMode: boolean): string {
  return selectionMode ? "Cancel select" : "Select"
}

/** Toggle label for Manage multi-select mode. */
export function describeManageSelectModeLabel(selectionMode: boolean): string {
  return selectionMode ? "Cancel selection" : "Select"
}

/**
 * Add every wall id between `fromId` and `toId` (inclusive) to the selection.
 * If either id is missing from the wall order, falls back to toggling `toId`.
 */
export function selectWallIdRange(
  selected: ReadonlySet<string>,
  wallOrderIds: readonly string[],
  fromId: string,
  toId: string
): Set<string> {
  const fromIndex = wallOrderIds.indexOf(fromId)
  const toIndex = wallOrderIds.indexOf(toId)
  if (fromIndex < 0 || toIndex < 0) {
    return toggleWallSelection(selected, toId)
  }
  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  const next = new Set(selected)
  for (let i = start; i <= end; i += 1) {
    const id = wallOrderIds[i]
    if (id) next.add(id)
  }
  return next
}
