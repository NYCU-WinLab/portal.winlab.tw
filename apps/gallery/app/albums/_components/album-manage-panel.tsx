"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IconArrowDown,
  IconArrowUp,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import {
  deleteGalleryAlbum,
  removeImageFromGalleryAlbum,
  reorderGalleryAlbumImages,
  updateGalleryAlbum,
} from "@/app/actions/albums"
import { DownloadAlbumButton } from "@/app/_components/download-album-button"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import type {
  GalleryAlbumDetail,
  GalleryAlbumPhoto,
} from "@/lib/gallery/albums"
import {
  GALLERY_ALBUM_DESCRIPTION_MAX,
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

function thumbFor(photo: GalleryAlbumPhoto): string {
  if (photo.media_type === "video" && photo.poster_path) {
    return getGalleryThumbUrl(photo.poster_path)
  }
  return getGalleryThumbUrl(photo.image_path)
}

export function GalleryAlbumManagePanel({
  album,
}: {
  album: GalleryAlbumDetail
}) {
  const router = useRouter()
  const [title, setTitle] = useState(album.title)
  const [description, setDescription] = useState(album.description ?? "")
  const [photos, setPhotos] = useState(album.photos)
  const [pending, startTransition] = useTransition()

  const photoIds = useMemo(() => photos.map((p) => p.image_id), [photos])

  const saveMeta = () => {
    const normalized = normalizeGalleryAlbumTitle(title)
    if (!normalized) {
      toast.error("Give the album a name with letters or numbers.")
      return
    }
    startTransition(async () => {
      const result = await updateGalleryAlbum({
        albumId: album.id,
        title: normalized,
        description: description.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Album updated")
      if (result.data.slug !== album.slug) {
        router.replace(`/albums/${result.data.slug}`)
      } else {
        router.refresh()
      }
    })
  }

  const movePhoto = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= photos.length) return
    const next = [...photos]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(nextIndex, 0, item)
    setPhotos(next)
    startTransition(async () => {
      const result = await reorderGalleryAlbumImages(
        album.id,
        next.map((p) => p.image_id)
      )
      if (!result.ok) {
        toast.error(result.error)
        setPhotos(photos)
        return
      }
      router.refresh()
    })
  }

  const removePhoto = (imageId: string) => {
    startTransition(async () => {
      const result = await removeImageFromGalleryAlbum(album.id, imageId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPhotos((prev) => prev.filter((p) => p.image_id !== imageId))
      toast.success("Removed from album")
      router.refresh()
    })
  }

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteGalleryAlbum(album.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Album deleted")
      router.push("/albums")
      router.refresh()
    })
  }

  return (
    <section className={cn(galleryPanelClass(), "space-y-6")}>
      <div className="space-y-1">
        <p
          className={cn(
            gallerySans(),
            "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
          )}
        >
          Curate
        </p>
        <h2 className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}>
          Edit album
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-album-title" className={gallerySans()}>
            Title
          </Label>
          <Input
            id="edit-album-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={GALLERY_ALBUM_TITLE_MAX}
            disabled={pending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-album-description" className={gallerySans()}>
            Description
          </Label>
          <Textarea
            id="edit-album-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={GALLERY_ALBUM_DESCRIPTION_MAX}
            disabled={pending}
            rows={3}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={saveMeta} disabled={pending}>
          Save details
        </Button>
        {photos.length > 0 ? (
          <DownloadAlbumButton
            className={cn(
              gallerySans(),
              "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
              "hover:bg-accent hover:text-accent-foreground"
            )}
            albumTitle={title.trim() || album.title}
            items={photos.map((photo) => ({
              name: photo.name,
              image_path: photo.image_path,
              position: photo.position,
            }))}
            disabled={pending}
          />
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={pending}>
              <IconTrash className="size-4" aria-hidden />
              Delete album
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete &ldquo;{album.title}&rdquo;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Photos stay on the wall — only this curated collection goes
                away. The share link stops working.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="space-y-3 border-t border-border/50 pt-5">
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Order ({photoIds.length} photo{photoIds.length === 1 ? "" : "s"})
        </p>
        {photos.length === 0 ? (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            Add photos from the wall lightbox — pick &ldquo;Add to album&rdquo;.
          </p>
        ) : (
          <ul className="space-y-2">
            {photos.map((photo, index) => (
              <li
                key={photo.image_id}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-background/70 p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbFor(photo)}
                  alt=""
                  className="size-12 shrink-0 rounded-[1px] object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      gallerySans(),
                      "truncate text-sm text-foreground"
                    )}
                  >
                    {photo.name}
                  </p>
                  <p
                    className={cn(
                      gallerySans(),
                      "truncate text-[11px] text-muted-foreground"
                    )}
                  >
                    {photo.uploader_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending || index === 0}
                    aria-label="Move up"
                    onClick={() => movePhoto(index, -1)}
                  >
                    <IconArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending || index === photos.length - 1}
                    aria-label="Move down"
                    onClick={() => movePhoto(index, 1)}
                  >
                    <IconArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label="Remove from album"
                    onClick={() => removePhoto(photo.image_id)}
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
