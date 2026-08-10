"use client"

import { useRef, useState, useTransition } from "react"
import { IconAlbum, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import {
  addImagesToGalleryAlbum,
  createGalleryAlbum,
  deleteGalleryAlbum,
  listMyGalleryAlbums,
} from "@/app/actions/albums"
import { gallerySans } from "@/components/gallery-chrome"
import {
  describeAddToAlbumResult,
  describeAddToAlbumDialogDescription,
  describeAddToAlbumDialogTitle,
  describeAddToAlbumTriggerLabel,
  describeAlbumCreateRollbackError,
  describeCreateAlbumAndAddPhotosAriaLabel,
  describeCreateAlbumStarted,
  describeNewAlbumTitlePlaceholder,
} from "@/lib/gallery/add-to-album-result"
import { describeCopyLinkLabel } from "@/lib/gallery/dialog-action-labels"
import {
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"
import { shareOrCopyAlbumLink } from "@/lib/gallery/album-share"
import { describeAlbumShareCopied } from "@/lib/gallery/album-share-toast"
import {
  describeAlbumTitleRequired,
  describeSelectAtLeastOnePhoto,
} from "@/lib/gallery/validation-toasts"

type MyAlbumOption = {
  id: string
  title: string
  slug: string
  photo_count: number
}

function copyLinkAction(album: { slug: string; title: string }) {
  return {
    label: describeCopyLinkLabel(),
    onClick: () => {
      void shareOrCopyAlbumLink(album).then((result) => {
        if (!result.ok) {
          if (result.reason === "aborted") return
          toast.error(result.message)
          return
        }
        if (result.mode === "copied") toast.success(describeAlbumShareCopied())
      })
    },
  }
}

/**
 * Add one or many wall covers to an album (lightbox single-shot or wall
 * multi-select). Uses `addImagesToGalleryAlbum` so bulk stays one RPC.
 */
export function GalleryAddToAlbum({
  imageIds,
  triggerLabel,
  title,
  description,
  onAdded,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  imageIds: string[]
  triggerLabel?: string
  title?: string
  description?: string
  onAdded?: (payload: {
    albumId: string
    slug: string
    title: string
    added: number
  }) => void
  triggerClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [albums, setAlbums] = useState<MyAlbumOption[] | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const ids = imageIds.filter(Boolean)
  const count = ids.length
  const dialogTitle = title ?? describeAddToAlbumDialogTitle(count)
  const dialogDescription =
    description ?? describeAddToAlbumDialogDescription(count)

  const ensureAlbums = () => {
    if (albums !== null) return
    startTransition(async () => {
      const result = await listMyGalleryAlbums()
      if (!result.ok) {
        toast.error(result.error)
        setAlbums([])
        return
      }
      setAlbums(result.data)
    })
  }

  const addTo = (album: MyAlbumOption) => {
    if (pending) return
    if (ids.length === 0) {
      toast.error(describeSelectAtLeastOnePhoto())
      return
    }
    startTransition(async () => {
      const result = await addImagesToGalleryAlbum(album.id, ids)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const added = result.data.added
      const copy = describeAddToAlbumResult({
        added,
        selected: ids.length,
        albumTitle: album.title,
      })
      if (copy.kind === "message") {
        toast.message(copy.title)
      } else {
        toast.success(copy.title, { action: copyLinkAction(album) })
      }
      setAlbums((prev) =>
        (prev ?? []).map((item) =>
          item.id === album.id
            ? { ...item, photo_count: item.photo_count + added }
            : item
        )
      )
      onAdded?.({
        albumId: album.id,
        slug: album.slug,
        title: album.title,
        added,
      })
      setOpen(false)
    })
  }

  const createAndAdd = () => {
    if (pending) return
    const normalized = normalizeGalleryAlbumTitle(draftTitle)
    if (!normalized) {
      toast.error(describeAlbumTitleRequired())
      return
    }
    if (ids.length === 0) {
      toast.error(describeSelectAtLeastOnePhoto())
      return
    }
    startTransition(async () => {
      const created = await createGalleryAlbum({ title: normalized })
      if (!created.ok) {
        toast.error(created.error)
        return
      }
      const addedResult = await addImagesToGalleryAlbum(created.data.id, ids)
      if (!addedResult.ok) {
        const rolledBack = await deleteGalleryAlbum(created.data.id)
        toast.error(
          rolledBack.ok
            ? addedResult.error
            : describeAlbumCreateRollbackError({
                title: created.data.title,
                addError: addedResult.error,
              })
        )
        return
      }
      const added = addedResult.data.added
      setAlbums((prev) => [
        {
          id: created.data.id,
          title: created.data.title,
          slug: created.data.slug,
          photo_count: added,
        },
        ...(prev ?? []),
      ])
      setDraftTitle("")
      toast.success(
        describeCreateAlbumStarted({
          title: created.data.title,
          added,
        }),
        { action: copyLinkAction(created.data) }
      )
      onAdded?.({
        albumId: created.data.id,
        slug: created.data.slug,
        title: created.data.title,
        added,
      })
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          ensureAlbums()
          return
        }
        if (controlledOpen === undefined) {
          queueMicrotask(() => triggerRef.current?.focus())
        }
      }}
    >
      {controlledOpen === undefined ? (
        <DialogTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={count === 0}
            className={cn(
              gallerySans(),
              "h-8 gap-1.5 text-[11px] uppercase",
              triggerClassName
            )}
          >
            <IconAlbum className="size-3.5" aria-hidden />
            {triggerLabel ?? describeAddToAlbumTriggerLabel(count)}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-md" aria-busy={pending || undefined}>
        <DialogHeader>
          <DialogTitle className={gallerySans()}>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {albums === null ? (
            <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
              Loading your albums…
            </p>
          ) : albums.length > 0 ? (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {albums.map((album) => (
                <li key={album.id}>
                  <button
                    type="button"
                    disabled={pending || count === 0}
                    aria-busy={pending || undefined}
                    onClick={() => addTo(album)}
                    className={cn(
                      gallerySans(),
                      "flex w-full items-center justify-between rounded-md border border-border/60 bg-background/80 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-60"
                    )}
                  >
                    <span className="truncate font-medium text-foreground">
                      {album.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {album.photo_count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
              No albums yet — create one below.
            </p>
          )}

          <div className="flex gap-2 border-t border-border/50 pt-3">
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              maxLength={GALLERY_ALBUM_TITLE_MAX}
              placeholder={describeNewAlbumTitlePlaceholder()}
              disabled={pending || count === 0}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  createAndAdd()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              disabled={pending || count === 0}
              aria-busy={pending || undefined}
              aria-label={describeCreateAlbumAndAddPhotosAriaLabel()}
              onClick={createAndAdd}
            >
              <IconPlus className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
