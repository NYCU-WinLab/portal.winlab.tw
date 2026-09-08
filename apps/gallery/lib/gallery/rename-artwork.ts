import { sanitizeArtworkName } from "@/lib/gallery/upload-naming"
import type { GalleryImage } from "@/lib/gallery/types"

export type ArtworkNamePatch = {
  id: string
  name: string
}

export type SequenceRenameRow = {
  id: string
  sequence_index: number | null
}

/** Normalize a rename draft; empty / whitespace becomes Untitled. */
export function normalizeArtworkRenameDraft(raw: string): string {
  return sanitizeArtworkName(raw)
}

/**
 * Cover rename cascades across the burst: index 0 keeps the base name,
 * later shots append their sequence index (same rule as upload naming).
 */
export function buildSequenceRenamePatches(
  rows: SequenceRenameRow[],
  baseName: string
): ArtworkNamePatch[] {
  const base = sanitizeArtworkName(baseName)
  return rows.map((row, idx) => {
    const sequenceIndex =
      typeof row.sequence_index === "number" ? row.sequence_index : idx
    const name =
      sequenceIndex === 0
        ? base
        : sanitizeArtworkName(`${base}${sequenceIndex}`)
    return { id: row.id, name }
  })
}

export function shouldCascadeSequenceRename(
  sequenceId: string | null | undefined,
  sequenceIndex: number | null | undefined
): boolean {
  return Boolean(sequenceId) && sequenceIndex === 0
}

/** Apply server-returned name patches onto a wall card (cover + sequence strip). */
export function applyArtworkRenamePatches(
  image: GalleryImage,
  patches: ArtworkNamePatch[]
): GalleryImage {
  if (patches.length === 0) return image
  const byId = new Map(patches.map((patch) => [patch.id, patch.name]))
  const coverName = byId.get(image.id)
  const nextItems = image.sequence_items.map((item) => {
    const nextName = byId.get(item.id)
    return nextName === undefined ? item : { ...item, name: nextName }
  })
  const itemsChanged = nextItems.some(
    (item, index) => item !== image.sequence_items[index]
  )
  if (coverName === undefined && !itemsChanged) return image
  return {
    ...image,
    name: coverName ?? image.name,
    sequence_items: itemsChanged ? nextItems : image.sequence_items,
  }
}
