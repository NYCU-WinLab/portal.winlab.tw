"use client"

import { registerGalleryImage } from "@/app/upload/actions"
import {
  describeUploadFailure,
  isAbortError,
  stageFromRegisterError,
  UploadFailureError,
  type UploadFailure,
} from "@/lib/gallery/upload-errors"
import {
  buildArtworkName,
  inferArtworkName,
  sanitizeArtworkName,
} from "@/lib/gallery/upload-naming"
import {
  buildClientObjectPath,
  formatByteLimit,
  GALLERY_STORAGE_MAX_BYTES,
  resolveStorageExtension,
} from "@/lib/gallery/upload-path"
import { extractTakenAtFromFile } from "@/lib/gallery/extract-taken-at-client"
import { resolveMediaMimeType, type ResolvedMime } from "@/lib/gallery/mime"
import { createClient } from "@/lib/supabase/client"
import {
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_INPUT_BYTES,
  compressVideo,
  type CompressPhase,
} from "@/lib/gallery/video-compress"

export type UploadStatus =
  | { kind: "idle" }
  | {
      kind: "working"
      label: string
      ratio: number
      batch?: { current: number; total: number }
    }

export type UploadRunResult = {
  successCount: number
  failures: UploadFailure[]
  wallPhotoId: string | null
  cancelled: boolean
  sequenceId: string | null
}

export const PHASE_LABEL: Record<CompressPhase, string> = {
  init: "Loading encoder",
  probe: "Reading video",
  compress: "Compressing to 720p",
  poster: "Capturing cover frame",
}

type SupabaseBrowser = ReturnType<typeof createClient>

type UploadCtx = {
  supabase: SupabaseBrowser
  userId: string
  file: File
  artworkName: string
  setStatus: (s: UploadStatus) => void
  labelPrefix: string
  sequenceId: string | null
  sequenceIndex: number | null
  tagNames?: string[]
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Upload aborted.", "AbortError")
}

async function uploadBytesToStorage(
  supabase: SupabaseBrowser,
  objectPath: string,
  body: Blob,
  contentType: string,
  signal?: AbortSignal
) {
  throwIfAborted(signal)
  try {
    const { error } = await supabase.storage
      .from("gallery")
      .upload(objectPath, body, {
        contentType,
        upsert: false,
      })
    if (error) {
      throw new UploadFailureError("storage-upload", error.message, undefined)
    }
  } catch (error) {
    if (error instanceof UploadFailureError) throw error
    if (isAbortError(error)) throw error
    const described = describeUploadFailure(error)
    throw new UploadFailureError(
      described.stage === "unknown" ? "storage-upload" : described.stage,
      described.detail,
      described.userMessage
    )
  }
  throwIfAborted(signal)
}

async function registerOrCleanup(
  supabase: SupabaseBrowser,
  paths: string[],
  input: Parameters<typeof registerGalleryImage>[0]
): Promise<string> {
  const result = await registerGalleryImage(input)
  if (!result.ok) {
    await supabase.storage.from("gallery").remove(paths)
    const stage = stageFromRegisterError(result.error)
    throw new UploadFailureError(stage, result.error)
  }
  return result.id
}

/** Image: mime → storage → register. */
export async function uploadImageFile(
  ctx: UploadCtx & { resolved: ResolvedMime }
): Promise<string> {
  const {
    supabase,
    userId,
    file,
    resolved,
    artworkName,
    setStatus,
    labelPrefix,
    sequenceId,
    sequenceIndex,
    signal,
  } = ctx

  throwIfAborted(signal)

  if (file.size > GALLERY_STORAGE_MAX_BYTES) {
    throw new UploadFailureError(
      "storage-upload",
      `File too large (max ${formatByteLimit(GALLERY_STORAGE_MAX_BYTES)}).`,
      `This photo is over ${formatByteLimit(GALLERY_STORAGE_MAX_BYTES)}. Compress it or pick a smaller file.`
    )
  }

  const ext = resolveStorageExtension(resolved.mime, file.name)
  if (!ext) {
    throw new UploadFailureError(
      "type",
      "unsupported extension for this file",
      undefined
    )
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Reading capture time`,
    ratio: 0.15,
  })
  const takenAt = await extractTakenAtFromFile(file)
  throwIfAborted(signal)

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading ${file.name}`,
    ratio: 0.4,
  })

  const objectPath = buildClientObjectPath(userId, ext)
  await uploadBytesToStorage(supabase, objectPath, file, resolved.mime, signal)

  if (signal?.aborted) {
    await supabase.storage.from("gallery").remove([objectPath])
    throwIfAborted(signal)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Registering ${file.name}`,
    ratio: 0.85,
  })

  return registerOrCleanup(supabase, [objectPath], {
    name: artworkName,
    imagePath: objectPath,
    mediaType: "image",
    sequenceId,
    sequenceIndex,
    tagNames: ctx.tagNames,
    takenAt,
  })
}

/** Video: compress → storage (video+poster) → register. */
export async function uploadVideoFile(ctx: UploadCtx): Promise<string> {
  const {
    supabase,
    userId,
    file,
    artworkName,
    setStatus,
    labelPrefix,
    sequenceId,
    sequenceIndex,
    signal,
  } = ctx

  let compressed
  try {
    compressed = await compressVideo(file, {
      signal,
      onProgress: (ratio, phase) => {
        setStatus({
          kind: "working",
          label: `${labelPrefix}${PHASE_LABEL[phase]}`,
          ratio,
        })
      },
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    const described = describeUploadFailure(error)
    throw new UploadFailureError(
      "video-processing",
      described.detail,
      described.userMessage
    )
  }

  if (!compressed.video || !compressed.poster) {
    throw new UploadFailureError(
      "video-processing",
      "video compression did not return playable assets"
    )
  }

  if (compressed.video.size > GALLERY_STORAGE_MAX_BYTES) {
    throw new UploadFailureError(
      "storage-upload",
      `Compressed video exceeds ${formatByteLimit(GALLERY_STORAGE_MAX_BYTES)}.`,
      `Compressed video is still over ${formatByteLimit(GALLERY_STORAGE_MAX_BYTES)}. Try a shorter clip.`
    )
  }

  throwIfAborted(signal)

  const videoPath = buildClientObjectPath(userId, compressed.videoExt)
  const posterPath = buildClientObjectPath(userId, compressed.posterExt)

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading video`,
    ratio: 0.3,
  })
  try {
    await uploadBytesToStorage(
      supabase,
      videoPath,
      compressed.video,
      compressed.videoMime,
      signal
    )
  } catch (error) {
    throw error
  }

  if (signal?.aborted) {
    await supabase.storage.from("gallery").remove([videoPath])
    throwIfAborted(signal)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading cover`,
    ratio: 0.7,
  })
  try {
    await uploadBytesToStorage(
      supabase,
      posterPath,
      compressed.poster,
      compressed.posterMime,
      signal
    )
  } catch (error) {
    await supabase.storage.from("gallery").remove([videoPath])
    throw error
  }

  if (signal?.aborted) {
    await supabase.storage.from("gallery").remove([videoPath, posterPath])
    throwIfAborted(signal)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Registering`,
    ratio: 0.9,
  })

  return registerOrCleanup(supabase, [videoPath, posterPath], {
    name: artworkName,
    imagePath: videoPath,
    mediaType: "video",
    posterPath,
    durationSeconds: compressed.durationSeconds,
    sequenceId,
    sequenceIndex,
    tagNames: ctx.tagNames,
  })
}

export type RunUploadOptions = {
  files: File[]
  baseName: string
  setStatus: (s: UploadStatus) => void
  signal: AbortSignal
  tagNames?: string[]
  /** When retrying, preserve prior sequence metadata per file. */
  sequenceMeta?: Array<{
    sequenceId: string | null
    sequenceIndex: number | null
  }>
}

export async function runGalleryUpload({
  files,
  baseName,
  setStatus,
  signal,
  tagNames,
  sequenceMeta,
}: RunUploadOptions): Promise<UploadRunResult> {
  const supabase = createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) {
    throw new UploadFailureError("unknown", "Not signed in.", "Not signed in.")
  }

  const trimmed = baseName.trim()
  const failures: UploadFailure[] = []
  let successCount = 0
  let wallPhotoId: string | null = null
  let cancelled = false

  const sharedSequenceId =
    !sequenceMeta && files.length > 1 ? crypto.randomUUID() : null

  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) {
      cancelled = true
      break
    }

    const file = files[i]!
    const meta = sequenceMeta?.[i]
    const sequenceId = meta !== undefined ? meta.sequenceId : sharedSequenceId
    const sequenceIndex =
      meta !== undefined ? meta.sequenceIndex : sequenceId ? i : null

    const batchCurrent = i + 1
    const labelPrefix =
      files.length > 1 ? `(${batchCurrent}/${files.length}) ` : ""

    if (files.length > 1) {
      setStatus({
        kind: "working",
        label: `Uploading ${batchCurrent} of ${files.length}`,
        ratio: (i + 0.05) / files.length,
        batch: { current: batchCurrent, total: files.length },
      })
    }

    const resolved = resolveMediaMimeType(file)
    if (!resolved) {
      failures.push({
        file,
        stage: "type",
        detail: `unsupported type: ${file.type || "unknown"}`,
        userMessage: describeUploadFailure(
          new UploadFailureError(
            "type",
            `unsupported type: ${file.type || "unknown"}`
          )
        ).userMessage,
        sequenceId,
        sequenceIndex,
      })
      continue
    }

    const artworkName =
      sequenceId != null && sequenceIndex != null
        ? trimmed
          ? sequenceIndex === 0
            ? sanitizeArtworkName(trimmed)
            : sanitizeArtworkName(`${trimmed}${sequenceIndex}`)
          : inferArtworkName(file.name)
        : buildArtworkName(files, trimmed, i)

    try {
      let registeredId: string
      if (resolved.kind === "image") {
        registeredId = await uploadImageFile({
          supabase,
          userId,
          file,
          resolved,
          artworkName,
          setStatus,
          labelPrefix,
          sequenceId,
          sequenceIndex,
          tagNames,
          signal,
        })
      } else {
        registeredId = await uploadVideoFile({
          supabase,
          userId,
          file,
          artworkName,
          setStatus,
          labelPrefix,
          sequenceId,
          sequenceIndex,
          tagNames,
          signal,
        })
      }

      const isCover =
        sequenceId == null
          ? true
          : sequenceIndex === 0 || (sequenceIndex == null && i === 0)
      if (!wallPhotoId && isCover) {
        wallPhotoId = registeredId
      }
      successCount += 1
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        cancelled = true
        break
      }
      const described = describeUploadFailure(error)
      failures.push({
        file,
        detail: described.detail,
        userMessage: described.userMessage,
        stage: described.stage,
        sequenceId,
        sequenceIndex,
      })
    }
  }

  setStatus({ kind: "idle" })

  return {
    successCount,
    failures,
    wallPhotoId,
    cancelled,
    sequenceId: sharedSequenceId,
  }
}

export { VIDEO_MAX_DURATION_SECONDS, VIDEO_MAX_INPUT_BYTES }
