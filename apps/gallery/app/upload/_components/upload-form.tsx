"use client"

import type { FormEvent } from "react"
import { useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { useGalleryUpload } from "@/hooks/gallery/use-gallery-upload"
import { formatFailurePreview } from "@/lib/gallery/upload-errors"
import { buildArtworkName } from "@/lib/gallery/upload-naming"
import {
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_INPUT_BYTES,
} from "@/lib/gallery/upload-pipeline"

/** Thin UI — mime/compress/storage/register live in lib + useGalleryUpload. */
export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const {
    pending,
    status,
    failedUploads,
    setFailedUploads,
    cancelUpload,
    runUpload,
    retryFailedUploads,
  } = useGalleryUpload()

  const fileNames = selectedFiles.map((file) => file.name)
  const trimmedName = name.trim()
  const sequencePreview = useMemo(() => {
    if (selectedFiles.length === 0) return []
    return selectedFiles
      .slice(0, 4)
      .map((_, index) => buildArtworkName(selectedFiles, trimmedName, index))
  }, [selectedFiles, trimmedName])

  function resetForm() {
    formRef.current?.reset()
    setName("")
    setSelectedFiles([])
    setFailedUploads([])
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fileInput =
      formRef.current?.querySelector<HTMLInputElement>("#gallery-file")
    const files = Array.from(fileInput?.files ?? [])

    if (files.length === 0) {
      toast.error("Pick a file.")
      return
    }
    if (files.some((file) => file.size === 0)) {
      toast.error("One of the selected files is empty.")
      return
    }

    runUpload(files, name, { onAllSucceeded: resetForm })
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
          in your browser. Gallery storage cap is 30 MB per file after
          compression. HEIC/HEIF from iPhone are accepted.
        </p>
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Multi-select uploads are grouped as one sequence on the wall.
        </p>
        {selectedFiles.length > 1 && trimmedName ? (
          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
            <p
              className={cn(
                gallerySans(),
                "text-xs font-medium text-foreground"
              )}
            >
              Sequence naming preview
            </p>
            <p
              className={cn(
                gallerySans(),
                "mt-1 text-xs text-muted-foreground"
              )}
            >
              {sequencePreview.join(", ")}
              {selectedFiles.length > sequencePreview.length
                ? ` (+${selectedFiles.length - sequencePreview.length} more)`
                : ""}
            </p>
          </div>
        ) : null}
        {failedUploads.length > 0 ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3">
            <p
              className={cn(
                gallerySans(),
                "text-sm font-medium text-foreground"
              )}
            >
              Failed uploads
            </p>
            <ul
              className={cn(
                gallerySans(),
                "mt-2 space-y-1 text-xs text-muted-foreground"
              )}
            >
              {failedUploads.slice(0, 4).map((failure, index) => (
                <li
                  key={`${failure.file.name}:${failure.stage}:${failure.sequenceIndex ?? index}`}
                >
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
                  retryFailedUploads(failedUploads, name, {
                    onAllSucceeded: resetForm,
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelUpload}
            className={cn(gallerySans(), "self-start")}
          >
            Cancel upload
          </Button>
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending || status.kind === "working"}
        className={cn(gallerySans(), "h-12 rounded-full")}
      >
        {pending || status.kind === "working"
          ? "Uploading…"
          : "Upload selected"}
      </Button>
    </form>
  )
}
