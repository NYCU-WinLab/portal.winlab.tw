"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryImageTags } from "@/app/_components/gallery-image-tags"
import { listGalleryImageTags } from "@/app/actions/tags"
import { gallerySans } from "@/components/gallery-chrome"
import { describeLoadingTagsLabel } from "@/lib/gallery/busy-labels"
import type { GalleryTag } from "@/lib/gallery/tags"
import {
  describeCouldNotLoadTags,
  describeEditTagsAriaLabel,
  describeTagsButtonLabel,
} from "@/lib/gallery/tag-admin-toast"

export function ManageTagsEditor({
  imageId,
  imageName,
}: {
  imageId: string
  imageName: string
}) {
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<GalleryTag[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function loadTags() {
    if (pending) return
    setTags(null)
    setLoadError(null)
    startTransition(async () => {
      const result = await listGalleryImageTags(imageId)
      if (!result.ok) {
        setLoadError(result.error)
        toast.error(result.error)
        return
      }
      setLoadError(null)
      setTags(result.data)
    })
  }

  function openEditor(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setLoadError(null)
      queueMicrotask(() => triggerRef.current?.focus())
      return
    }
    loadTags()
  }

  return (
    <Dialog open={open} onOpenChange={openEditor}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        onClick={() => openEditor(true)}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={describeEditTagsAriaLabel(imageName)}
        className={cn(
          gallerySans(),
          "!text-lg text-muted-foreground italic hover:bg-transparent hover:text-foreground"
        )}
      >
        {describeTagsButtonLabel()}
      </Button>
      <DialogContent className="gap-6" aria-busy={pending || undefined}>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl italic">Tags</DialogTitle>
        </DialogHeader>
        {pending && tags == null && !loadError ? (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            {describeLoadingTagsLabel()}
          </p>
        ) : loadError ? (
          <div className="space-y-3">
            <p
              role="status"
              aria-live="polite"
              className={cn(gallerySans(), "text-sm text-amber-800")}
            >
              {describeCouldNotLoadTags(loadError)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={loadTags}
              className={gallerySans()}
            >
              Retry
            </Button>
          </div>
        ) : tags ? (
          <GalleryImageTags imageId={imageId} tags={tags} canEdit />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
