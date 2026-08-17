"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { createGalleryAlbum } from "@/app/actions/albums"
import {
  gallerySans,
  gallerySectionLeadClass,
} from "@/components/gallery-chrome"
import {
  GALLERY_ALBUM_DESCRIPTION_MAX,
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumSlug,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"
import {
  buildGalleryAlbumShareUrl,
  shareOrCopyAlbumLink,
} from "@/lib/gallery/album-share"
import { describeAlbumCreateReady } from "@/lib/gallery/album-share-toast"
import {
  describeCreateAlbumLabel,
  describeAlbumCreateDescriptionPlaceholder,
  describeAlbumCreateTitlePlaceholder,
} from "@/lib/gallery/album-manage-copy"
import { describeCreatingLabel } from "@/lib/gallery/busy-labels"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"
import { describeAlbumTitleRequired } from "@/lib/gallery/validation-toasts"

export function GalleryAlbumCreateForm({ className }: { className?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [pending, startTransition] = useTransition()

  const slugPreview = normalizeGalleryAlbumSlug(title)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeGalleryAlbumTitle(title)
    if (!normalized) {
      toast.error(describeAlbumTitleRequired())
      return
    }

    startTransition(async () => {
      const result = await createGalleryAlbum({
        title: normalized,
        description: description.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const shareUrl = buildGalleryAlbumShareUrl(result.data.slug)
      const share = await shareOrCopyAlbumLink({
        slug: result.data.slug,
        title: result.data.title,
        preferCopy: true,
      })
      if (share.ok && share.mode === "copied") {
        toast.success(
          describeAlbumCreateReady({
            title: result.data.title,
            linkCopied: true,
          }),
          {
            description: shareUrl ?? undefined,
          }
        )
      } else {
        toast.success(
          describeAlbumCreateReady({
            title: result.data.title,
            linkCopied: false,
          }),
          {
            description: shareUrl
              ? `Share: ${shareUrl}`
              : "Open the album to copy its share link.",
          }
        )
      }
      setTitle("")
      setDescription("")
      try {
        router.push(`/albums/${result.data.slug}`)
      } catch {
        toast.error(describeGalleryNavError("openNewAlbum"))
      }
      try {
        router.refresh()
      } catch {
        toast.error(describeGalleryNavError("refreshGalleryChrome"))
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("space-y-4", className)}
      aria-label={describeCreateAlbumLabel()}
      aria-busy={pending || undefined}
    >
      <div className="space-y-2">
        <Label htmlFor="album-title" className={gallerySans()}>
          Title
        </Label>
        <Input
          id="album-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={GALLERY_ALBUM_TITLE_MAX}
          placeholder={describeAlbumCreateTitlePlaceholder()}
          disabled={pending}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="album-description" className={gallerySans()}>
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="album-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={GALLERY_ALBUM_DESCRIPTION_MAX}
          placeholder={describeAlbumCreateDescriptionPlaceholder()}
          disabled={pending}
          rows={3}
        />
        <p className={cn(gallerySectionLeadClass(), "text-xs")}>
          {slugPreview ? (
            <>
              Shareable URL becomes{" "}
              <span className="text-foreground">/albums/{slugPreview}</span>
            </>
          ) : (
            <>
              Shareable URL becomes{" "}
              <span className="text-foreground">/albums/&lt;slug&gt;</span> from
              the title.
            </>
          )}
        </p>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? describeCreatingLabel() : describeCreateAlbumLabel()}
      </Button>
    </form>
  )
}
