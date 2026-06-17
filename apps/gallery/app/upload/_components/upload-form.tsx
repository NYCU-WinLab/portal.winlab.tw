"use client"

import type { FormEvent } from "react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import { registerGalleryImage } from "@/app/upload/actions"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
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
    }

const PHASE_LABEL: Record<CompressPhase, string> = {
  init: "Loading encoder",
  probe: "Reading video",
  compress: "Compressing to 720p",
  poster: "Capturing cover frame",
}

/** Client uploads bytes to Supabase Storage; server action only registers the row (no 413 on Vercel). */
export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [fileNames, setFileNames] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  function inferArtworkName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, "").trim()
    return base || "Untitled"
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = formRef.current
    const fileInput = form?.querySelector<HTMLInputElement>("#gallery-file")
    const files = Array.from(fileInput?.files ?? [])
    const trimmed = name.trim()

    if (files.length === 0) {
      toast.error("Pick a file.")
      return
    }
    if (files.some((file) => file.size === 0)) {
      toast.error("One of the selected files is empty.")
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { data: claimsData } = await supabase.auth.getClaims()
      const userId = claimsData?.claims?.sub
      if (!userId) {
        toast.error("Not signed in.")
        return
      }

      let successCount = 0
      const failed: string[] = []
      const sequenceId = files.length > 1 ? crypto.randomUUID() : null

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const labelPrefix =
          files.length > 1 ? `(${i + 1}/${files.length}) ` : ""

        const resolved = resolveMediaMimeType(file)
        if (!resolved) {
          failed.push(
            `${file.name} (unsupported type: ${file.type || "unknown"})`
          )
          continue
        }

        const artworkName =
          files.length === 1 && trimmed ? trimmed : inferArtworkName(file.name)

        try {
          if (resolved.kind === "image") {
            await uploadImage({
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
            await uploadVideo({
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
          successCount += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          failed.push(`${file.name} (${message})`)
        }
      }

      setStatus({ kind: "idle" })

      if (successCount > 0) {
        const suffix = successCount > 1 ? "s" : ""
        toast.success(`Uploaded ${successCount} work${suffix}.`)
        form?.reset()
        setName("")
        setFileNames([])
      }
      if (failed.length > 0) {
        const preview = failed.slice(0, 3).join("; ")
        const hidden = failed.length > 3 ? ` (+${failed.length - 3} more)` : ""
        toast.error(`Failed ${failed.length}: ${preview}${hidden}`)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-name"
          className={cn(gallerySerif(), "text-base")}
        >
          Name (single upload only)
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
          onChange={(e) =>
            setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))
          }
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
      </div>
      {status.kind === "working" ? (
        <div className="flex flex-col gap-2">
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
): Promise<void> {
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
  if (ext === "bin") throw new Error("Unsupported extension")

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
  if (uploadError) throw new Error(uploadError.message)

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
    throw new Error(result.error)
  }
}

async function uploadVideo(ctx: UploadCtx): Promise<void> {
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
  if (videoErr) throw new Error(videoErr.message)

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
    throw new Error(posterErr.message)
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
    throw new Error(result.error)
  }
}
