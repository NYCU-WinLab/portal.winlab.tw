"use client"

import { useState, useTransition } from "react"
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
import type { GalleryTag } from "@/lib/gallery/tags"

export function ManageTagsEditor({
  imageId,
  imageName,
}: {
  imageId: string
  imageName: string
}) {
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<GalleryTag[] | null>(null)
  const [pending, startTransition] = useTransition()

  function openEditor(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return
    setTags(null)
    startTransition(async () => {
      const result = await listGalleryImageTags(imageId)
      if (!result.ok) {
        toast.error(result.error)
        setOpen(false)
        return
      }
      setTags(result.data)
    })
  }

  return (
    <Dialog open={open} onOpenChange={openEditor}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => openEditor(true)}
        aria-label={`Edit tags for ${imageName}`}
        className={cn(
          gallerySans(),
          "!text-lg text-muted-foreground italic hover:bg-transparent hover:text-foreground"
        )}
      >
        Tags
      </Button>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl italic">Tags</DialogTitle>
        </DialogHeader>
        {pending || tags == null ? (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            Loading tags…
          </p>
        ) : (
          <GalleryImageTags imageId={imageId} tags={tags} canEdit />
        )}
      </DialogContent>
    </Dialog>
  )
}
