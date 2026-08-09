"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IconArrowDown,
  IconArrowUp,
  IconGripVertical,
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import {
  deleteGalleryAlbum,
  removeImageFromGalleryAlbum,
  removeImagesFromGalleryAlbum,
  reorderGalleryAlbumImages,
  updateGalleryAlbum,
} from "@/app/actions/albums"
import { DownloadAlbumButton } from "@/app/_components/download-album-button"
import { ShareAlbumButton } from "@/app/_components/share-album-button"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { useSequencePointerReorder } from "@/hooks/use-sequence-pointer-reorder"
import type {
  GalleryAlbumDetail,
  GalleryAlbumPhoto,
} from "@/lib/gallery/albums"
import {
  GALLERY_ALBUM_DESCRIPTION_MAX,
  GALLERY_ALBUM_TITLE_MAX,
  nextAlbumCoverAfterRemove,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

function thumbFor(photo: GalleryAlbumPhoto): string {
  if (photo.media_type === "video" && photo.poster_path) {
    return getGalleryThumbUrl(photo.poster_path)
  }
  return getGalleryThumbUrl(photo.image_path)
}

function ManageAlbumThumb({ photo }: { photo: GalleryAlbumPhoto }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-[1px] bg-zinc-200/80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/mark.png"
          alt=""
          width={20}
          height={20}
          className="size-5 object-contain opacity-40 grayscale"
          draggable={false}
        />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbFor(photo)}
      alt=""
      className="size-12 shrink-0 rounded-[1px] object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
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
  const [coverImageId, setCoverImageId] = useState(album.cover_image_id)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmRemovePhoto = photos.find(
    (photo) => photo.image_id === confirmRemoveId
  )

  const photoIds = useMemo(() => photos.map((p) => p.image_id), [photos])
  const selectedCount = selected.size
  const allSelected =
    photos.length > 0 && photos.every((photo) => selected.has(photo.image_id))

  const toggleSelected = (imageId: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(imageId)
      else copy.delete(imageId)
      return copy
    })
  }

  const toggleSelectAll = (next: boolean) => {
    if (!next) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(photoIds))
  }

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

  const applyReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setPhotos((prev) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex >= prev.length ||
          fromIndex === toIndex
        ) {
          return prev
        }
        const next = [...prev]
        const [item] = next.splice(fromIndex, 1)
        if (!item) return prev
        next.splice(toIndex, 0, item)
        const previous = prev
        startTransition(async () => {
          const result = await reorderGalleryAlbumImages(
            album.id,
            next.map((p) => p.image_id)
          )
          if (!result.ok) {
            toast.error(result.error)
            setPhotos(previous)
            return
          }
          router.refresh()
        })
        return next
      })
    },
    [album.id, router]
  )

  const {
    listRef,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
  } = useSequencePointerReorder({
    itemCount: photos.length,
    disabled: pending,
    onReorder: applyReorder,
  })

  const removePhoto = (imageId: string) => {
    setConfirmRemoveId(null)
    const previousPhotos = photos
    const previousCover = coverImageId
    const remaining = photos.filter((p) => p.image_id !== imageId)
    setPhotos(remaining)
    setCoverImageId(
      nextAlbumCoverAfterRemove(
        coverImageId,
        remaining.map((p) => p.image_id),
        [imageId]
      )
    )
    setSelected((prev) => {
      if (!prev.has(imageId)) return prev
      const copy = new Set(prev)
      copy.delete(imageId)
      return copy
    })
    startTransition(async () => {
      const result = await removeImageFromGalleryAlbum(album.id, imageId)
      if (!result.ok) {
        setPhotos(previousPhotos)
        setCoverImageId(previousCover)
        toast.error(result.error)
        return
      }
      toast.success("Removed from album")
      router.refresh()
    })
  }

  const removeSelected = () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const previous = photos
    const previousCover = coverImageId
    const remaining = photos.filter((p) => !selected.has(p.image_id))
    setPhotos(remaining)
    setCoverImageId(
      nextAlbumCoverAfterRemove(
        coverImageId,
        remaining.map((p) => p.image_id),
        ids
      )
    )
    setSelected(new Set())
    startTransition(async () => {
      const result = await removeImagesFromGalleryAlbum(album.id, ids)
      if (!result.ok) {
        setPhotos(previous)
        setCoverImageId(previousCover)
        setSelected(new Set(ids))
        toast.error(result.error)
        return
      }
      const removed = result.data.removed
      toast.success(
        removed === 1
          ? "Removed 1 photo from album"
          : `Removed ${removed} photos from album`
      )
      router.refresh()
    })
  }

  const setCover = (imageId: string) => {
    const previous = coverImageId
    setCoverImageId(imageId)
    startTransition(async () => {
      const result = await updateGalleryAlbum({
        albumId: album.id,
        coverImageId: imageId,
      })
      if (!result.ok) {
        setCoverImageId(previous)
        toast.error(result.error)
        return
      }
      toast.success("Cover updated")
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

      <div
        className={cn(
          gallerySans(),
          "rounded-md border border-border/60 bg-background/60 px-3 py-2.5 text-xs text-muted-foreground"
        )}
      >
        <p className="font-medium text-foreground">Share this album</p>
        <p className="mt-0.5">
          Copy the link and send it — anyone signed into Gallery can open{" "}
          <span className="text-foreground">/albums/{album.slug}</span>.
        </p>
        <div className="mt-2">
          <ShareAlbumButton
            slug={album.slug}
            title={title.trim() || album.title}
            emphasize
            disabled={pending}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            Order ({photoIds.length} photo{photoIds.length === 1 ? "" : "s"})
          </p>
          {photos.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={cn(
                  gallerySans(),
                  "inline-flex items-center gap-2 text-xs text-muted-foreground"
                )}
              >
                <Checkbox
                  checked={allSelected}
                  disabled={pending}
                  onCheckedChange={(value) => toggleSelectAll(value === true)}
                  aria-label="Select all photos"
                />
                Select all
              </label>
              {selectedCount > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      className={cn(gallerySans(), "h-8")}
                    >
                      Remove selected ({selectedCount})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Remove {selectedCount} photo
                        {selectedCount === 1 ? "" : "s"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Photos stay on the wall — only this album membership is
                        cleared. If the cover is included, the next remaining
                        shot becomes the cover.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={removeSelected}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : null}
        </div>
        {photos.length === 0 ? (
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            Add photos from the wall lightbox — pick &ldquo;Add to album&rdquo;.
          </p>
        ) : (
          <ul ref={listRef} className="space-y-2">
            {photos.map((photo, index) => {
              const isSelected = selected.has(photo.image_id)
              return (
                <li
                  key={photo.image_id}
                  data-sequence-index={index}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-border/60 bg-background/70 p-2",
                    "data-[sequence-drop-target=true]:border-foreground/35 data-[sequence-drop-target=true]:bg-foreground/[0.04]",
                    isSelected && "border-zinc-900/25 bg-zinc-900/[0.03]"
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Drag to reorder ${photo.name}`}
                    disabled={pending}
                    className={cn(
                      "inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground",
                      "hover:bg-muted/60 hover:text-foreground active:cursor-grabbing",
                      "disabled:pointer-events-none disabled:opacity-40",
                      "touch-none select-none"
                    )}
                    onPointerDown={(event) => onHandlePointerDown(index, event)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerUp}
                    onPointerCancel={onHandlePointerCancel}
                  >
                    <IconGripVertical className="size-4" aria-hidden />
                  </button>
                  <Checkbox
                    checked={isSelected}
                    disabled={pending}
                    onCheckedChange={(value) =>
                      toggleSelected(photo.image_id, value === true)
                    }
                    aria-label={`Select ${photo.name}`}
                  />
                  <ManageAlbumThumb photo={photo} />
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
                      size="sm"
                      variant="ghost"
                      disabled={pending || coverImageId === photo.image_id}
                      className={cn(
                        gallerySans(),
                        "h-8 px-2 text-[11px]",
                        coverImageId === photo.image_id && "text-foreground"
                      )}
                      onClick={() => setCover(photo.image_id)}
                    >
                      {coverImageId === photo.image_id ? "Cover" : "Set cover"}
                    </Button>
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
                      onClick={() => setConfirmRemoveId(photo.image_id)}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={confirmRemoveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove{" "}
              {confirmRemovePhoto?.name
                ? `“${confirmRemovePhoto.name}”`
                : "this photo"}{" "}
              from the album?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The photo stays on the wall. Only this album membership is
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !confirmRemoveId}
              onClick={() => {
                if (confirmRemoveId) removePhoto(confirmRemoveId)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
