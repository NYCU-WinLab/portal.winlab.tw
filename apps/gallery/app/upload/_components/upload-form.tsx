"use client"

import type { DragEvent, FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { IconPhotoPlus, IconX } from "@tabler/icons-react"

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [tagsDraft, setTagsDraft] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
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

  useEffect(() => {
    const urls = selectedFiles.slice(0, 6).map((file) => {
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        return URL.createObjectURL(file)
      }
      return ""
    })
    setPreviewUrls(urls)
    return () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [selectedFiles])

  function assignFiles(files: File[]) {
    const next = files.filter((file) => file.size > 0)
    if (next.length === 0) {
      toast.error("Pick a photo or clip.")
      return
    }
    setFailedUploads([])
    setSelectedFiles(next)
    const input = fileInputRef.current
    if (input) {
      const transfer = new DataTransfer()
      for (const file of next) transfer.items.add(file)
      input.files = transfer.files
    }
  }

  function resetForm() {
    formRef.current?.reset()
    setName("")
    setTagsDraft("")
    setSelectedFiles([])
    setFailedUploads([])
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const files = selectedFiles.length
      ? selectedFiles
      : Array.from(fileInputRef.current?.files ?? [])

    if (files.length === 0) {
      toast.error("Pick a file.")
      return
    }
    if (files.some((file) => file.size === 0)) {
      toast.error("One of the selected files is empty.")
      return
    }

    const tagNames = tagsDraft
      .split(/[,，]/)
      .map((part) => part.trim())
      .filter(Boolean)

    runUpload(files, name, { onAllSucceeded: resetForm, tagNames })
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    if (pending || status.kind === "working") return
    assignFiles(Array.from(event.dataTransfer.files ?? []))
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p
          className={cn(
            gallerySans(),
            "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
          )}
        >
          Darkroom tray
        </p>
        <h2
          className={cn(gallerySerif(), "text-2xl text-foreground sm:text-3xl")}
        >
          Develop & hang
        </h2>
        <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
          Drop polaroids onto the film strip — multi-select becomes one sequence
          story on the wall.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-name"
          className={cn(gallerySerif(), "text-base")}
        >
          Title
        </Label>
        <Input
          id="gallery-name"
          name="name"
          placeholder="Untitled lab moment"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          className={cn(
            gallerySans(),
            "h-11 rounded-xl border-border/60 bg-background"
          )}
        />
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Base name for a single shot, or the cover title when you multi-select
          a sequence.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-tags"
          className={cn(gallerySerif(), "text-base")}
        >
          Tags
        </Label>
        <Input
          id="gallery-tags"
          name="tags"
          placeholder="lab trip, sunset"
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          disabled={pending}
          className={cn(
            gallerySans(),
            "h-11 rounded-xl border-border/60 bg-background"
          )}
        />
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Optional. Comma-separated — applied to every shot in this upload.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="gallery-file"
          className={cn(gallerySerif(), "text-base")}
        >
          Photos & clips
        </Label>
        <input
          ref={fileInputRef}
          id="gallery-file"
          name="file"
          type="file"
          accept="image/*,video/*"
          required={selectedFiles.length === 0}
          multiple
          disabled={pending}
          className="sr-only"
          onClick={() => setFailedUploads([])}
          onChange={(e) => assignFiles(Array.from(e.target.files ?? []))}
        />
        <label
          htmlFor="gallery-file"
          onDragEnter={(event) => {
            event.preventDefault()
            if (!pending) setDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!pending) setDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            if (event.currentTarget.contains(event.relatedTarget as Node)) {
              return
            }
            setDragging(false)
          }}
          onDrop={onDrop}
          className={cn(
            "gallery-upload-dropzone group relative cursor-pointer overflow-hidden rounded-xl border border-dashed transition-colors",
            dragging
              ? "border-foreground/40 bg-foreground/[0.06]"
              : "border-zinc-900/20 bg-zinc-900/[0.03] hover:border-foreground/25 hover:bg-zinc-900/[0.05]",
            pending && "pointer-events-none opacity-60"
          )}
        >
          <div
            aria-hidden
            className="gallery-film-sprocket gallery-film-sprocket--left"
          />
          <div
            aria-hidden
            className="gallery-film-sprocket gallery-film-sprocket--right"
          />
          <div className="relative flex flex-col items-center gap-3 px-6 py-10 text-center sm:py-12">
            <span className="inline-flex size-12 items-center justify-center rounded-full border border-zinc-900/15 bg-[#f7f7f5] shadow-[0_8px_20px_-10px_rgba(24,24,27,0.45)]">
              <IconPhotoPlus className="size-5 text-foreground/80" />
            </span>
            <span className={cn(gallerySerif(), "text-xl text-foreground")}>
              {selectedFiles.length > 0
                ? `${selectedFiles.length} ready to develop`
                : "Drop photos here"}
            </span>
            <span
              className={cn(
                gallerySans(),
                "max-w-xs text-xs leading-relaxed text-muted-foreground"
              )}
            >
              {selectedFiles.length > 0
                ? "Click to replace, or hang them with Upload selected."
                : "Click to browse — images, HEIC, and short clips welcome."}
            </span>
          </div>
        </label>

        {previewUrls.some(Boolean) ? (
          <ul className="gallery-upload-preview-strip flex gap-2 overflow-x-auto py-1">
            {selectedFiles.slice(0, 6).map((file, index) => {
              const url = previewUrls[index]
              const isVideo = file.type.startsWith("video/")
              return (
                <li
                  key={`${file.name}-${index}`}
                  className="relative h-[4.75rem] w-16 shrink-0 overflow-hidden rounded-[1px] border-[3px] border-[#f7f7f5] bg-[#f7f7f5] shadow-[0_6px_16px_-8px_rgba(24,24,27,0.35)]"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                    <img
                      src={url}
                      alt=""
                      className="h-[calc(100%-0.55rem)] w-full object-cover"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      {isVideo ? "Clip" : "File"}
                    </div>
                  )}
                  {isVideo ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 flex h-[calc(100%-0.55rem)] items-center justify-center bg-black/20 text-[10px] font-medium text-white"
                    >
                      Video
                    </span>
                  ) : null}
                </li>
              )
            })}
            {selectedFiles.length > 6 ? (
              <li
                className={cn(
                  gallerySans(),
                  "flex h-[4.75rem] w-16 shrink-0 items-center justify-center rounded-[1px] border border-dashed border-border/70 text-xs text-muted-foreground"
                )}
              >
                +{selectedFiles.length - 6}
              </li>
            ) : null}
          </ul>
        ) : null}

        {fileNames.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
              {fileNames.length} selected: {fileNames.slice(0, 3).join(", ")}
              {fileNames.length > 3 ? ` (+${fileNames.length - 3} more)` : ""}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSelectedFiles([])
                setFailedUploads([])
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
              className={cn(
                gallerySans(),
                "inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              )}
            >
              <IconX className="size-3" aria-hidden />
              Clear
            </button>
          </div>
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
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-900/12 bg-zinc-900/[0.04] px-4 py-3">
          {status.batch ? (
            <p
              className={cn(
                gallerySans(),
                "text-sm font-medium text-foreground tabular-nums"
              )}
            >
              Developing {status.batch.current}/{status.batch.total}
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
          ? "Developing…"
          : selectedFiles.length > 1
            ? `Hang sequence (${selectedFiles.length})`
            : "Hang on the wall"}
      </Button>
    </form>
  )
}
