export type WallPhotoSource = {
  id: string
  sequence_id: string | null
  sequence_index: number | null
}

/** Wall deep links always use the sequence cover (index 0) when applicable. */
export function resolveWallPhotoId(
  image: WallPhotoSource,
  siblings: WallPhotoSource[]
): string {
  if (!image.sequence_id || image.sequence_index === 0) return image.id
  const cover = siblings.find(
    (row) => row.sequence_id === image.sequence_id && row.sequence_index === 0
  )
  return cover?.id ?? image.id
}
