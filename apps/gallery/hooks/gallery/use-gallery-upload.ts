"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import {
  formatFailurePreview,
  type UploadFailure,
} from "@/lib/gallery/upload-errors"
import {
  runGalleryUpload,
  type UploadStatus,
} from "@/lib/gallery/upload-pipeline"
import { describeUploadWorksToast } from "@/lib/gallery/upload-toast"

type RunOptions = {
  onAllSucceeded?: () => void
}

export function useGalleryUpload({
  sequencesAvailable = true,
}: {
  sequencesAvailable?: boolean
} = {}) {
  const router = useRouter()
  const softPush = (href: string, errorMessage: string) => {
    try {
      router.push(href)
    } catch {
      toast.error(errorMessage)
    }
  }
  const abortRef = useRef<AbortController | null>(null)
  const [pending, startTransition] = useTransition()
  const [failedUploads, setFailedUploads] = useState<UploadFailure[]>([])
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" })

  useEffect(() => {
    if (status.kind !== "working") return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [status.kind])

  function beginAbortableRun() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    return controller
  }

  function cancelUpload() {
    abortRef.current?.abort()
  }

  function toastFailures(failures: UploadFailure[], still = false) {
    if (failures.length === 0) return
    const preview = failures.slice(0, 2).map(formatFailurePreview).join("; ")
    const hidden = failures.length > 2 ? ` (+${failures.length - 2} more)` : ""
    toast.error(
      `${still ? "Still failed" : "Failed"} ${failures.length}: ${preview}${hidden}`
    )
  }

  function toastSuccesses(
    successCount: number,
    wallPhotoId: string | null,
    sequenceId: string | null,
    failures: UploadFailure[]
  ) {
    if (successCount <= 0) return
    if (wallPhotoId) {
      const href = buildGalleryPhotoHref({ photoId: wallPhotoId })
      toast.success(describeUploadWorksToast(successCount), {
        action: {
          label: "View on wall",
          onClick: () => softPush(href, "Could not open the wall photo."),
        },
      })
    } else {
      toast.success(describeUploadWorksToast(successCount))
    }

    if (sequenceId && failures.length > 0) {
      toast.message(
        "Sequence has missing shots — open Manage to see gaps, then Retry failed.",
        {
          action: {
            label: "Manage",
            onClick: () => softPush("/upload", "Could not open Manage."),
          },
        }
      )
    } else if (sequenceId && !wallPhotoId) {
      toast.message(
        "Sequence is missing a cover shot — set cover in Manage so it appears on the wall.",
        {
          action: {
            label: "Manage",
            onClick: () => softPush("/upload", "Could not open Manage."),
          },
        }
      )
    }
  }

  function runUpload(
    files: File[],
    baseName: string,
    opts?: RunOptions & { tagNames?: string[] }
  ) {
    startTransition(async () => {
      const controller = beginAbortableRun()
      try {
        const result = await runGalleryUpload({
          files,
          baseName,
          setStatus,
          signal: controller.signal,
          tagNames: opts?.tagNames,
          sequencesAvailable,
        })

        if (abortRef.current === controller) abortRef.current = null
        setFailedUploads(result.failures)

        if (result.cancelled) {
          toast.message(
            result.successCount > 0
              ? `Upload cancelled. ${result.successCount} finished before cancel.`
              : "Upload cancelled."
          )
          return
        }

        toastSuccesses(
          result.successCount,
          result.wallPhotoId,
          result.sequenceId,
          result.failures
        )

        if (result.successCount > 0 && result.failures.length === 0) {
          opts?.onAllSucceeded?.()
          return
        }

        toastFailures(result.failures)
      } catch (error) {
        if (abortRef.current === controller) abortRef.current = null
        setStatus({ kind: "idle" })
        const message =
          error instanceof Error ? error.message : "Upload failed."
        toast.error(message)
      }
    })
  }

  function retryFailedUploads(
    failures: UploadFailure[],
    baseName: string,
    opts?: RunOptions
  ) {
    if (failures.length === 0) return

    startTransition(async () => {
      const controller = beginAbortableRun()
      try {
        const result = await runGalleryUpload({
          files: failures.map((f) => f.file),
          baseName,
          setStatus,
          signal: controller.signal,
          sequencesAvailable,
          sequenceMeta: failures.map((f) => ({
            sequenceId: f.sequenceId,
            sequenceIndex: f.sequenceIndex,
          })),
        })

        if (abortRef.current === controller) abortRef.current = null

        if (result.cancelled) {
          setFailedUploads(
            result.failures.length > 0 ? result.failures : failures
          )
          toast.message(
            result.successCount > 0
              ? `Retry cancelled. ${result.successCount} finished before cancel.`
              : "Retry cancelled."
          )
          return
        }

        setFailedUploads(result.failures)
        toastSuccesses(
          result.successCount,
          result.wallPhotoId,
          null,
          result.failures
        )

        if (result.failures.length === 0) {
          opts?.onAllSucceeded?.()
          return
        }

        toastFailures(result.failures, true)
      } catch (error) {
        if (abortRef.current === controller) abortRef.current = null
        setStatus({ kind: "idle" })
        const message = error instanceof Error ? error.message : "Retry failed."
        toast.error(message)
      }
    })
  }

  return {
    pending,
    status,
    failedUploads,
    setFailedUploads,
    cancelUpload,
    runUpload,
    retryFailedUploads,
  }
}
