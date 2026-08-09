import type { SupabaseClient } from "@supabase/supabase-js"

import {
  resolveWallPhotoId,
  type WallPhotoSource,
} from "@/lib/gallery/wall-photo-id"

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

/** Rows that still need a real capture date for Memories. */
export function rowNeedsCaptureDate(row: ManageUploadRow): boolean {
  return looksLikeUploadDayTakenAt(row.taken_at, row.created_at)
}

export function countUploadDayRows(rows: ManageUploadRow[]): number {
  return rows.filter(rowNeedsCaptureDate).length
}

export function filterUploadDayRows(
  rows: ManageUploadRow[]
): ManageUploadRow[] {
  return rows.filter(rowNeedsCaptureDate)
}

/** Ids currently shown in the Manage timeline (after Incomplete / Upload day?). */
export function flattenVisibleManageIds(
  timeline: Array<
    | { kind: "sequence"; sequence: { items: Array<{ id: string }> } }
    | { kind: "single"; row: { id: string } }
  >
): string[] {
  const ids: string[] = []
  for (const entry of timeline) {
    if (entry.kind === "single") {
      ids.push(entry.row.id)
      continue
    }
    for (const item of entry.sequence.items) {
      ids.push(item.id)
    }
  }
  return ids
}

type ManageSlideshowSource = Pick<
  ManageUploadRow,
  | "id"
  | "name"
  | "image_path"
  | "media_type"
  | "poster_path"
  | "sequence_id"
  | "sequence_index"
>

export type ManageSlideshowPhoto = {
  image_id: string
  name: string
  image_path: string
  media_type: "image" | "video"
  poster_path: string | null
}

function toManageSlideshowPhoto(
  image: ManageSlideshowSource
): ManageSlideshowPhoto | null {
  if (!image.image_path) return null
  return {
    image_id: image.id,
    name: image.name,
    image_path: image.image_path,
    media_type: image.media_type,
    poster_path: image.poster_path,
  }
}

/** Selected Manage rows → slideshow deck (selection order, no expansion). */
export function manageSelectionToSlideshowPhotos(
  orderedSelectedIds: readonly string[],
  images: readonly ManageSlideshowSource[]
): ManageSlideshowPhoto[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const photos: ManageSlideshowPhoto[] = []
  for (const id of orderedSelectedIds) {
    const image = byId.get(id)
    if (!image) continue
    const photo = toManageSlideshowPhoto(image)
    if (photo) photos.push(photo)
  }
  return photos
}

/**
 * Like manageSelectionToSlideshowPhotos, but the first selected shot in a
 * sequence expands to every sibling (story order). Later selections from the
 * same sequence are skipped.
 */
export function expandManageSelectionSlideshowPhotos(
  orderedSelectedIds: readonly string[],
  images: readonly ManageSlideshowSource[]
): ManageSlideshowPhoto[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const bySequence = new Map<string, ManageSlideshowSource[]>()
  for (const image of images) {
    if (!image.sequence_id) continue
    const bucket = bySequence.get(image.sequence_id) ?? []
    bucket.push(image)
    bySequence.set(image.sequence_id, bucket)
  }
  for (const [sequenceId, bucket] of bySequence) {
    bySequence.set(
      sequenceId,
      [...bucket].sort((a, b) => {
        const ai =
          typeof a.sequence_index === "number" ? a.sequence_index : Infinity
        const bi =
          typeof b.sequence_index === "number" ? b.sequence_index : Infinity
        if (ai !== bi) return ai - bi
        return a.id.localeCompare(b.id)
      })
    )
  }

  const photos: ManageSlideshowPhoto[] = []
  const seenSequences = new Set<string>()
  for (const id of orderedSelectedIds) {
    const image = byId.get(id)
    if (!image) continue
    if (image.sequence_id) {
      if (seenSequences.has(image.sequence_id)) continue
      seenSequences.add(image.sequence_id)
      const siblings = bySequence.get(image.sequence_id) ?? [image]
      for (const shot of siblings) {
        const photo = toManageSlideshowPhoto(shot)
        if (photo) photos.push(photo)
      }
      continue
    }
    const photo = toManageSlideshowPhoto(image)
    if (photo) photos.push(photo)
  }
  return photos
}

/** ZIP entries for Manage selection with sequence sibling expansion. */
export function expandManageSelectionZipItems(
  orderedSelectedIds: readonly string[],
  images: readonly ManageSlideshowSource[]
): Array<{ name: string; image_path: string; position: number }> {
  return expandManageSelectionSlideshowPhotos(orderedSelectedIds, images).map(
    (photo, position) => ({
      name: photo.name,
      image_path: photo.image_path,
      position,
    })
  )
}

/**
 * Wall deep-link ids for a Manage selection — sequence shots collapse to the
 * cover representative and duplicates are dropped.
 */
export function resolveManageSelectionWallPhotoIds(
  orderedSelectedIds: readonly string[],
  images: readonly ManageUploadRow[]
): string[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of orderedSelectedIds) {
    const row = byId.get(id)
    if (!row) continue
    const wallId = resolveWallPhotoId(row, images)
    if (seen.has(wallId)) continue
    seen.add(wallId)
    ids.push(wallId)
  }
  return ids
}

/** Drop selected ids that are no longer in the Manage image list. */
export function pruneManageSelectionIds(
  selected: ReadonlySet<string>,
  validIds: ReadonlySet<string>
): Set<string> {
  if (selected.size === 0) {
    return selected instanceof Set ? selected : new Set()
  }
  let changed = false
  const next = new Set<string>()
  for (const id of selected) {
    if (validIds.has(id)) next.add(id)
    else changed = true
  }
  if (!changed) {
    return selected instanceof Set ? selected : new Set(selected)
  }
  return next
}

export function isGalleryTakenAtUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  if (!/taken_at/i.test(message)) return false
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  )
}

/** True when gallery_images.pinned_at is missing from the schema cache. */
export function isGalleryPinnedAtUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  if (!/pinned_at/i.test(message)) return false
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  )
}

/** True when gallery_images.sequence_id / sequence_index are missing. */
export function isGallerySequenceUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  if (!/sequence_id|sequence_index/i.test(message)) return false
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  )
}

/** True when gallery video columns (media_type / poster / duration) are missing. */
export function isGalleryVideoColumnsUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const message = error.message ?? ""
  const code = error.code ?? ""
  if (!/media_type|poster_path|duration_seconds/i.test(message)) return false
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /could not find/i.test(message)
  )
}

/** True when gallery video columns are selectable. */
export async function isGalleryVideoReady(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from("gallery_images")
    .select("media_type")
    .limit(1)
  if (!error) return true
  return !isGalleryVideoColumnsUnavailable(error)
}

/** True when gallery_images.pinned_at is selectable (pin migration applied). */
export async function isGalleryPinReady(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from("gallery_images")
    .select("pinned_at")
    .limit(1)
  if (!error) return true
  return !isGalleryPinnedAtUnavailable(error)
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
