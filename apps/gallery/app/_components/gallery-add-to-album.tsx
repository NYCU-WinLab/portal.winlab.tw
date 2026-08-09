"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
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
  listMyGalleryAlbums,
} from "@/app/actions/albums"
import { gallerySans } from "@/components/gallery-chrome"
import {
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"
import { shareOrCopyAlbumLink } from "@/lib/gallery/album-share"

type MyAlbumOption = {
  id: string
  title: string
  slug: string
  photo_count: number
}

function copyLinkAction(album: { slug: string; title: string }) {
  return {
    label: "Copy link",
    onClick: () => {
      void shareOrCopyAlbumLink(album)
        .then((mode) => {
          if (mode === "copied") toast.success("Share link copied")
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          toast.error("Could not copy album link")
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

  const ids = imageIds.filter(Boolean)
  const count = ids.length
  const dialogTitle =
    title ?? (count > 1 ? `Add ${count} photos to album` : "Add to album")
  const dialogDescription =
    description ??
    (count > 1
      ? "Curate the selected wall covers into one of your collections."
      : "Curate this shot into one of your collections. Share links live at /albums/<slug>.")

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
    if (ids.length === 0) {
      toast.error("Select at least one photo.")
      return
    }
    startTransition(async () => {
      const result = await addImagesToGalleryAlbum(album.id, ids)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const added = result.data.added
      if (added === 0) {
        toast.message("Already in that album (or nothing new to add).")
      } else {
        toast.success(
          <span>
            Added {added} to{" "}
            <Link href={`/albums/${album.slug}`} className="underline">
              {album.title}
            </Link>
          </span>,
          { action: copyLinkAction(album) }
        )
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
    const normalized = normalizeGalleryAlbumTitle(draftTitle)
    if (!normalized) {
      toast.error("Give the album a name with letters or numbers.")
      return
    }
    if (ids.length === 0) {
      toast.error("Select at least one photo.")
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
        toast.error(addedResult.error)
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
        <span>
          Started{" "}
          <Link href={`/albums/${created.data.slug}`} className="underline">
            {created.data.title}
          </Link>
          {added > 1 ? ` with ${added} photos` : ""}
        </span>,
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
        if (next) ensureAlbums()
      }}
    >
      {controlledOpen === undefined ? (
        <DialogTrigger asChild>
          <Button
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
            {triggerLabel ??
              (count > 1 ? `Add ${count} to album` : "Add to album")}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-md">
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
              placeholder="New album title"
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
              aria-label="Create album and add photos"
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
