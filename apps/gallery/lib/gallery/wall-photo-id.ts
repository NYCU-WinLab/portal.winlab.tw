export type WallPhotoSource = {
  id: string
  sequence_id: string | null
  sequence_index: number | null
}

/**
 * Wall deep links use the sequence representative: lowest sequence_index
 * among siblings (index 0 when present). Falls back to the row itself.
 */
export function resolveWallPhotoId(
  image: WallPhotoSource,
  siblings: readonly WallPhotoSource[]
): string {
  if (!image.sequence_id) return image.id

  const inSequence = siblings.filter(
    (row) => row.sequence_id === image.sequence_id
  )
  if (inSequence.length === 0) return image.id

  const ranked = [...inSequence].sort((a, b) => {
    const ai =
      typeof a.sequence_index === "number" ? a.sequence_index : Infinity
    const bi =
      typeof b.sequence_index === "number" ? b.sequence_index : Infinity
    if (ai !== bi) return ai - bi
    return a.id.localeCompare(b.id)
  })

  return ranked[0]?.id ?? image.id
}

/** Pick the representative cover row from a sequence bucket. */
export function pickRepresentativeCover<T extends WallPhotoSource>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null
  const ranked = [...rows].sort((a, b) => {
    const ai =
      typeof a.sequence_index === "number" ? a.sequence_index : Infinity
    const bi =
      typeof b.sequence_index === "number" ? b.sequence_index : Infinity
    if (ai !== bi) return ai - bi
    return a.id.localeCompare(b.id)
  })
  return ranked[0] ?? null
}
