import type { ManageUploadRow } from "@/lib/gallery/manage-uploads"
import {
  isGalleryPinnedAtUnavailable,
  isGallerySequenceUnavailable,
  isGalleryTakenAtUnavailable,
  isGalleryVideoColumnsUnavailable,
} from "@/lib/gallery/manage-uploads"

export type ManageColumnCaps = {
  video: boolean
  sequence: boolean
  pin: boolean
  takenAt: boolean
}

export const MANAGE_SELECT_MINIMAL =
  "id, name, image_path, created_by, created_at"

export const FULL_MANAGE_CAPS: ManageColumnCaps = {
  video: true,
  sequence: true,
  pin: true,
  takenAt: true,
}

/** Build a gallery_images select list from optional-column capabilities. */
export function buildManageSelect(caps: ManageColumnCaps): string {
  let select = MANAGE_SELECT_MINIMAL
  if (caps.video) {
    select += ", media_type, poster_path, duration_seconds"
  }
  if (caps.sequence) {
    select += ", sequence_id, sequence_index"
  }
  if (caps.pin) {
    select += ", pinned_at"
  }
  if (caps.takenAt) {
    select += ", taken_at"
  }
  return select
}

type SoftError = { code?: string; message?: string } | null

/**
 * Peel exactly one missing optional column family from caps.
 * Returns null when the error is not a soft column miss (or nothing left to peel).
 */
export function peelManageCapsFromError(
  caps: ManageColumnCaps,
  error: SoftError
): ManageColumnCaps | null {
  if (!error) return null
  if (caps.video && isGalleryVideoColumnsUnavailable(error)) {
    return { ...caps, video: false }
  }
  if (caps.sequence && isGallerySequenceUnavailable(error)) {
    return { ...caps, sequence: false }
  }
  if (caps.takenAt && isGalleryTakenAtUnavailable(error)) {
    return { ...caps, takenAt: false }
  }
  if (caps.pin && isGalleryPinnedAtUnavailable(error)) {
    return { ...caps, pin: false }
  }
  return null
}

export type ManageSelectLoadResult = {
  data: unknown
  error: SoftError
}

export type ManageSelectCascadeResult = {
  rows: ManageUploadRow[] | null
  videoAvailable: boolean
  sequenceAvailable: boolean
  pinAvailable: boolean
  takenAtAvailable: boolean
}

function asManageRows(data: unknown): ManageUploadRow[] | null {
  return (data as ManageUploadRow[] | null) ?? null
}

function toResult(
  rows: ManageUploadRow[] | null,
  caps: ManageColumnCaps
): ManageSelectCascadeResult {
  return {
    rows,
    videoAvailable: caps.video,
    sequenceAvailable: caps.sequence,
    pinAvailable: caps.pin,
    takenAtAvailable: caps.takenAt,
  }
}

/**
 * Load Manage rows, peeling optional columns when the schema cache is behind.
 * `load` should already scope/order the query (e.g. created_by + created_at desc).
 */
export async function loadManageUploadsWithCascade(
  load: (select: string) => Promise<ManageSelectLoadResult>
): Promise<ManageSelectCascadeResult> {
  let caps: ManageColumnCaps = { ...FULL_MANAGE_CAPS }

  // Full select + at most one peel per optional family.
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await load(buildManageSelect(caps))
    if (!result.error) {
      return toResult(asManageRows(result.data), caps)
    }

    const peeled = peelManageCapsFromError(caps, result.error)
    if (!peeled) {
      return toResult(null, caps)
    }
    caps = peeled
  }

  return toResult(null, caps)
}
