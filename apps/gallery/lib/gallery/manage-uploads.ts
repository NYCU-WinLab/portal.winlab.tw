import type { WallPhotoSource } from "@/lib/gallery/wall-photo-id"

export type ManageUploadRow = WallPhotoSource & {
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
  duration_seconds: number | null
  created_at: string
  pinned_at: string | null
  /** Capture time for Memories; may be null/absent before migration. */
  taken_at?: string | null
}

/** True when taken_at looks like the upload timestamp (no real EXIF). */
export function looksLikeUploadDayTakenAt(
  takenAt: string | null | undefined,
  createdAt: string,
  toleranceMs = 120_000
): boolean {
  if (!takenAt) return true
  const taken = new Date(takenAt).getTime()
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(taken) || !Number.isFinite(created)) return true
  return Math.abs(taken - created) <= toleranceMs
}

export function isGalleryTakenAtUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /taken_at/i.test(message) ||
    /schema cache/i.test(message)
  )
}

export type ManageUploadSequence = {
  sequenceId: string
  items: ManageUploadRow[]
}

export function groupManageUploads(rows: ManageUploadRow[]): {
  singles: ManageUploadRow[]
  sequences: ManageUploadSequence[]
} {
  const singles: ManageUploadRow[] = []
  const bySequence = new Map<string, ManageUploadRow[]>()

  for (const row of rows) {
    if (!row.sequence_id) {
      singles.push(row)
      continue
    }
    const bucket = bySequence.get(row.sequence_id) ?? []
    bucket.push(row)
    bySequence.set(row.sequence_id, bucket)
  }

  const sequences = [...bySequence.entries()].map(([sequenceId, items]) => ({
    sequenceId,
    items: [...items].sort(
      (a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)
    ),
  }))

  sequences.sort(
    (a, b) =>
      new Date(b.items[0]?.created_at ?? 0).getTime() -
      new Date(a.items[0]?.created_at ?? 0).getTime()
  )

  return { singles, sequences }
}

export function swapSequenceOrder(
  orderedIds: string[],
  fromIndex: number,
  toIndex: number
): string[] | null {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= orderedIds.length ||
    toIndex >= orderedIds.length ||
    fromIndex === toIndex
  ) {
    return null
  }
  const next = [...orderedIds]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return null
  next.splice(toIndex, 0, moved)
  return next
}

/** Missing sequence_index values in 0..max(present), inclusive. */
export function findSequenceGaps(indices: Array<number | null | undefined>): {
  gaps: number[]
  maxIndex: number | null
  missingCover: boolean
} {
  const present = new Set<number>()
  let maxIndex = -1
  for (const value of indices) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      continue
    }
    const index = Math.floor(value)
    present.add(index)
    if (index > maxIndex) maxIndex = index
  }

  if (maxIndex < 0) {
    return { gaps: [], maxIndex: null, missingCover: false }
  }

  const gaps: number[] = []
  for (let i = 0; i <= maxIndex; i++) {
    if (!present.has(i)) gaps.push(i)
  }

  return {
    gaps,
    maxIndex,
    missingCover: !present.has(0),
  }
}

export function describeSequenceGaps(gaps: number[]): string | null {
  if (gaps.length === 0) return null
  if (gaps.length === 1) {
    return gaps[0] === 0
      ? "Missing cover (shot 1)"
      : `Missing shot ${gaps[0]! + 1}`
  }
  const labels = gaps.map((gap) => (gap === 0 ? "cover" : `shot ${gap + 1}`))
  return `Missing ${labels.join(", ")}`
}

/** Sequences with a gap in 0..max(present). */
export function filterIncompleteSequences(
  sequences: ManageUploadSequence[]
): ManageUploadSequence[] {
  return sequences.filter((sequence) => {
    const gaps = findSequenceGaps(
      sequence.items.map((item) => item.sequence_index)
    ).gaps
    return gaps.length > 0
  })
}

export function countIncompleteSequences(
  sequences: ManageUploadSequence[]
): number {
  return filterIncompleteSequences(sequences).length
}
