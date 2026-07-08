"use client"

import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import { registerGalleryImage } from "@/app/upload/actions"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import {
  guessExtension,
  resolveMediaMimeType,
  type ResolvedMime,
} from "@/lib/gallery/mime"
import { createClient } from "@/lib/supabase/client"
import {
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_INPUT_BYTES,
  compressVideo,
  type CompressPhase,
} from "@/lib/gallery/video-compress"

type Status =
  | { kind: "idle" }
  | {
      kind: "working"
      label: string
      ratio: number
      batch?: { current: number; total: number }
    }

type UploadFailure = {
  file: File
  detail: string
  stage:
    | "type"
    | "video-processing"
    | "storage-upload"
    | "storage-verify"
    | "db-insert"
    | "unknown"
  sequenceId: string | null
  sequenceIndex: number | null
}

const PHASE_LABEL: Record<CompressPhase, string> = {
  init: "Loading encoder",
  probe: "Reading video",
  compress: "Compressing to 720p",
  poster: "Capturing cover frame",
}

class UploadFailureError extends Error {
  constructor(
    readonly stage: UploadFailure["stage"],
    message: string
  ) {
    super(message)
    this.name = "UploadFailureError"
  }
}

function inferArtworkName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim()
  return base || "Untitled"
}

function buildArtworkName(
  files: File[],
  trimmedBaseName: string,
  index: number
): string {
  const file = files[index]
  if (!file) return trimmedBaseName || "Untitled"

  if (files.length === 1) {
    return trimmedBaseName || inferArtworkName(file.name)
  }

  if (!trimmedBaseName) {
    return inferArtworkName(file.name)
  }

  return index === 0 ? trimmedBaseName : `${trimmedBaseName}${index}`
}

function describeUploadFailure(error: unknown): {
  detail: string
  stage: UploadFailure["stage"]
} {
  if (error instanceof UploadFailureError) {
    return { detail: error.message, stage: error.stage }
  }

  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes("unsupported")) {
    return { detail: message, stage: "type" }
  }
  if (lower.includes("verify upload") || lower.includes("file not found")) {
    return { detail: message, stage: "storage-verify" }
  }
  if (lower.includes("database insert failed")) {
    return { detail: message, stage: "db-insert" }
  }
  if (
    lower.includes("compress") ||
    lower.includes("poster") ||
    lower.includes("video")
  ) {
    return { detail: message, stage: "video-processing" }
  }
  if (lower.includes("upload")) {
    return { detail: message, stage: "storage-upload" }
  }

  return { detail: message, stage: "unknown" }
}

function formatFailurePreview(failure: UploadFailure): string {
  return `${failure.file.name} [${failure.stage}] ${failure.detail}`
}

/** Client uploads bytes to Supabase Storage; server action only registers the row (no 413 on Vercel). */
export function UploadForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [failedUploads, setFailedUploads] = useState<UploadFailure[]>([])
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const fileNames = selectedFiles.map((file) => file.name)
  const trimmedName = name.trim()
  const sequencePreview = useMemo(() => {
    if (selectedFiles.length === 0) return []
    return selectedFiles
      .slice(0, 4)
      .map((_, index) => buildArtworkName(selectedFiles, trimmedName, index))
  }, [selectedFiles, trimmedName])

  useEffect(() => {
    if (status.kind !== "working") return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [status.kind])

  async function runUpload(files: File[], baseName: string) {
    const form = formRef.current
    const trimmed = baseName.trim()
    const supabase = createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const userId = claimsData?.claims?.sub
    if (!userId) {
      toast.error("Not signed in.")
      return
    }

    let successCount = 0
    const failures: UploadFailure[] = []
    const sequenceId = files.length > 1 ? crypto.randomUUID() : null
    let wallPhotoId: string | null = null
    const batch = files.length > 1 ? { total: files.length, current: 0 } : undefined

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const batchCurrent = i + 1
      const labelPrefix = files.length > 1 ? `(${batchCurrent}/${files.length}) ` : ""

      if (batch) {
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
          sequenceId,
          sequenceIndex: sequenceId ? i : null,
        })
        continue
      }

      const artworkName = buildArtworkName(files, trimmed, i)

      try {
        let registeredId: string
        if (resolved.kind === "image") {
          registeredId = await uploadImage({
            supabase,
            userId,
            file,
            resolved,
            artworkName,
            setStatus,
            labelPrefix,
            sequenceId,
            sequenceIndex: sequenceId ? i : null,
          })
        } else {
          registeredId = await uploadVideo({
            supabase,
            userId,
            file,
            artworkName,
            setStatus,
            labelPrefix,
            sequenceId,
            sequenceIndex: sequenceId ? i : null,
          })
        }

        if (!wallPhotoId && (sequenceId ? i === 0 : true)) {
          wallPhotoId = registeredId
        }
        successCount += 1
      } catch (error) {
        failures.push({
          file,
          ...describeUploadFailure(error),
          sequenceId,
          sequenceIndex: sequenceId ? i : null,
        })
      }
    }

    setStatus({ kind: "idle" })
    setFailedUploads(failures)

    if (successCount > 0) {
      const suffix = successCount > 1 ? "s" : ""
      if (wallPhotoId) {
        const href = buildGalleryPhotoHref({ photoId: wallPhotoId })
        toast.success(`Uploaded ${successCount} work${suffix}.`, {
          action: {
            label: "View on wall",
            onClick: () => router.push(href),
          },
        })
      } else {
        toast.success(`Uploaded ${successCount} work${suffix}.`)
      }

      if (failures.length === 0) {
        form?.reset()
        setName("")
        setSelectedFiles([])
      }
    }

    if (failures.length > 0) {
      const preview = failures.slice(0, 3).map(formatFailurePreview).join("; ")
      const hidden = failures.length > 3 ? ` (+${failures.length - 3} more)` : ""
      toast.error(`Failed ${failures.length}: ${preview}${hidden}`)
    }
  }

  async function retryFailedUploads(failures: UploadFailure[]) {
    if (failures.length === 0) return

    const trimmed = name.trim()
    const supabase = createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const userId = claimsData?.claims?.sub
    if (!userId) {
      toast.error("Not signed in.")
      return
    }

    let successCount = 0
    let wallPhotoId: string | null = null
    const nextFailures: UploadFailure[] = []
    const total = failures.length

    for (let i = 0; i < failures.length; i++) {
      const failure = failures[i]!
      const file = failure.file
      const batchCurrent = i + 1
      const labelPrefix = total > 1 ? `(${batchCurrent}/${total}) ` : ""

      setStatus({
        kind: "working",
        label: `Retrying ${batchCurrent} of ${total}`,
        ratio: (i + 0.05) / total,
        batch: { current: batchCurrent, total },
      })

      const resolved = resolveMediaMimeType(file)
      if (!resolved) {
        nextFailures.push({
          file,
          stage: "type",
          detail: `unsupported type: ${file.type || "unknown"}`,
          sequenceId: failure.sequenceId,
          sequenceIndex: failure.sequenceIndex,
        })
        continue
      }

      const artworkName =
        failure.sequenceId && failure.sequenceIndex != null
          ? trimmed
            ? failure.sequenceIndex === 0
              ? trimmed
              : `${trimmed}${failure.sequenceIndex}`
            : inferArtworkName(file.name)
          : trimmed
            ? trimmed
            : inferArtworkName(file.name)

      try {
        let registeredId: string
        if (resolved.kind === "image") {
          registeredId = await uploadImage({
            supabase,
            userId,
            file,
            resolved,
            artworkName,
            setStatus,
            labelPrefix,
            sequenceId: failure.sequenceId,
            sequenceIndex: failure.sequenceIndex,
          })
        } else {
          registeredId = await uploadVideo({
            supabase,
            userId,
            file,
            artworkName,
            setStatus,
            labelPrefix,
            sequenceId: failure.sequenceId,
            sequenceIndex: failure.sequenceIndex,
          })
        }

        if (
          !wallPhotoId &&
          (failure.sequenceId ? failure.sequenceIndex === 0 : true)
        ) {
          wallPhotoId = registeredId
        }

        successCount += 1
      } catch (error) {
        nextFailures.push({
          file,
          ...describeUploadFailure(error),
          sequenceId: failure.sequenceId,
          sequenceIndex: failure.sequenceIndex,
        })
      }
    }

    setStatus({ kind: "idle" })
    setFailedUploads(nextFailures)

    if (successCount > 0) {
      const suffix = successCount > 1 ? "s" : ""
      if (wallPhotoId) {
        const href = buildGalleryPhotoHref({ photoId: wallPhotoId })
        toast.success(`Uploaded ${successCount} work${suffix}.`, {
          action: {
            label: "View on wall",
            onClick: () => router.push(href),
          },
        })
      } else {
        toast.success(`Uploaded ${successCount} work${suffix}.`)
      }
    }

    if (nextFailures.length === 0) {
      formRef.current?.reset()
      setName("")
      setSelectedFiles([])
      return
    }

    const preview = nextFailures
      .slice(0, 3)
      .map(formatFailurePreview)
      .join("; ")
    const hidden =
      nextFailures.length > 3
        ? ` (+${nextFailures.length - 3} more)`
        : ""
    toast.error(`Still failed ${nextFailures.length}: ${preview}${hidden}`)
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fileInput = formRef.current?.querySelector<HTMLInputElement>("#gallery-file")
    const files = Array.from(fileInput?.files ?? [])

    if (files.length === 0) {
      toast.error("Pick a file.")
      return
    }
    if (files.some((file) => file.size === 0)) {
      toast.error("One of the selected files is empty.")
      return
    }

    startTransition(async () => {
      await runUpload(files, name)
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-name"
          className={cn(gallerySerif(), "text-base")}
        >
          Name (base name for single upload / sequence cover)
        </Label>
        <Input
          id="gallery-name"
          name="name"
          placeholder="Untitled, 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          className={cn(
            gallerySans(),
            "h-11 rounded-xl border-border/60 bg-background"
          )}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-file"
          className={cn(gallerySerif(), "text-base")}
        >
          Images & videos
        </Label>
        <Input
          id="gallery-file"
          name="file"
          type="file"
          accept="image/*,video/*"
          required
          multiple
          onClick={() => setFailedUploads([])}
          onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
          disabled={pending}
          className={cn(
            gallerySans(),
            "h-11 rounded-xl border-border/60 bg-background file:mr-3 file:text-sm"
          )}
        />
        {fileNames.length > 0 ? (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            {fileNames.length} selected: {fileNames.slice(0, 3).join(", ")}
            {fileNames.length > 3 ? ` (+${fileNames.length - 3} more)` : ""}
          </p>
        ) : null}
        <p
          className={cn(
            gallerySans(),
            "text-xs leading-relaxed text-muted-foreground"
          )}
        >
          Videos: max {VIDEO_MAX_DURATION_SECONDS}s and{" "}
          {VIDEO_MAX_INPUT_BYTES / 1024 / 1024} MB, auto-compressed to 720p mp4
          in your browser.
        </p>
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Multi-select uploads are grouped as one sequence on the wall.
        </p>
        {selectedFiles.length > 1 && trimmedName ? (
          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
            <p className={cn(gallerySans(), "text-xs font-medium text-foreground")}>
              Sequence naming preview
            </p>
            <p className={cn(gallerySans(), "mt-1 text-xs text-muted-foreground")}>
              {sequencePreview.join(", ")}
              {selectedFiles.length > sequencePreview.length
                ? ` (+${selectedFiles.length - sequencePreview.length} more)`
                : ""}
            </p>
          </div>
        ) : null}
        {failedUploads.length > 0 ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3">
            <p className={cn(gallerySans(), "text-sm font-medium text-foreground")}>
              Failed uploads
            </p>
            <ul className={cn(gallerySans(), "mt-2 space-y-1 text-xs text-muted-foreground")}>
              {failedUploads.slice(0, 4).map((failure) => (
                <li key={`${failure.file.name}:${failure.stage}`}>
                  {formatFailurePreview(failure)}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await retryFailedUploads(failedUploads)
                  })
                }
              >
                Retry failed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setFailedUploads([])}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {status.kind === "working" ? (
        <div className="flex flex-col gap-2">
          {status.batch ? (
            <p
              className={cn(
                gallerySans(),
                "text-sm font-medium text-foreground tabular-nums"
              )}
            >
              {status.batch.current}/{status.batch.total}
            </p>
          ) : null}
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            {status.label}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-200"
              style={{ width: `${Math.round(status.ratio * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className={cn(gallerySans(), "h-12 rounded-full")}
      >
        {pending ? "Uploading…" : "Upload selected"}
      </Button>
    </form>
  )
}

type UploadCtx = {
  supabase: ReturnType<typeof createClient>
  userId: string
  file: File
  artworkName: string
  setStatus: (s: Status) => void
  labelPrefix: string
  sequenceId: string | null
  sequenceIndex: number | null
}

async function uploadImage(
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
  } = ctx
  const ext = guessExtension(resolved.mime, file.name)
  if (ext === "bin") {
    throw new UploadFailureError(
      "type",
      "unsupported extension for this file"
    )
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading ${file.name}`,
    ratio: 0.4,
  })

  const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from("gallery")
    .upload(objectPath, file, {
      contentType: resolved.mime,
      upsert: false,
    })
  if (uploadError) {
    throw new UploadFailureError("storage-upload", uploadError.message)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Registering ${file.name}`,
    ratio: 0.85,
  })

  const result = await registerGalleryImage({
    name: artworkName,
    imagePath: objectPath,
    mediaType: "image",
    sequenceId,
    sequenceIndex,
  })
  if (!result.ok) {
    await supabase.storage.from("gallery").remove([objectPath])
    throw new UploadFailureError(
      result.error.includes("Database insert failed")
        ? "db-insert"
        : result.error.includes("verify upload") ||
            result.error.includes("File not found")
          ? "storage-verify"
          : "unknown",
      result.error
    )
  }
  return result.id
}

async function uploadVideo(ctx: UploadCtx): Promise<string> {
  const {
    supabase,
    userId,
    file,
    artworkName,
    setStatus,
    labelPrefix,
    sequenceId,
    sequenceIndex,
  } = ctx

  const compressed = await compressVideo(file, {
    onProgress: (ratio, phase) => {
      setStatus({
        kind: "working",
        label: `${labelPrefix}${PHASE_LABEL[phase]}`,
        ratio,
      })
    },
  })
  if (!compressed.video || !compressed.poster) {
    throw new UploadFailureError(
      "video-processing",
      "video compression did not return playable assets"
    )
  }

  const videoId = crypto.randomUUID()
  const posterId = crypto.randomUUID()
  const videoPath = `${userId}/${videoId}.${compressed.videoExt}`
  const posterPath = `${userId}/${posterId}.${compressed.posterExt}`

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading video`,
    ratio: 0.3,
  })
  const { error: videoErr } = await supabase.storage
    .from("gallery")
    .upload(videoPath, compressed.video, {
      contentType: compressed.videoMime,
      upsert: false,
    })
  if (videoErr) {
    throw new UploadFailureError("storage-upload", videoErr.message)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Uploading cover`,
    ratio: 0.7,
  })
  const { error: posterErr } = await supabase.storage
    .from("gallery")
    .upload(posterPath, compressed.poster, {
      contentType: compressed.posterMime,
      upsert: false,
    })
  if (posterErr) {
    await supabase.storage.from("gallery").remove([videoPath])
    throw new UploadFailureError("storage-upload", posterErr.message)
  }

  setStatus({
    kind: "working",
    label: `${labelPrefix}Registering`,
    ratio: 0.9,
  })
  const result = await registerGalleryImage({
    name: artworkName,
    imagePath: videoPath,
    mediaType: "video",
    posterPath,
    durationSeconds: compressed.durationSeconds,
    sequenceId,
    sequenceIndex,
  })
  if (!result.ok) {
    await supabase.storage.from("gallery").remove([videoPath, posterPath])
    throw new UploadFailureError(
      result.error.includes("Database insert failed")
        ? "db-insert"
        : result.error.includes("verify upload") ||
            result.error.includes("File not found")
          ? "storage-verify"
          : "unknown",
      result.error
    )
  }
  return result.id
}
