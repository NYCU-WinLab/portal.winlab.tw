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
  addImageToGalleryAlbum,
  createGalleryAlbum,
  listMyGalleryAlbums,
} from "@/app/actions/albums"
import { gallerySans } from "@/components/gallery-chrome"
import {
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"

type MyAlbumOption = {
  id: string
  title: string
  slug: string
  photo_count: number
}

export function GalleryAddToAlbum({ imageId }: { imageId: string }) {
  const [open, setOpen] = useState(false)
  const [albums, setAlbums] = useState<MyAlbumOption[] | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [pending, startTransition] = useTransition()

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
    startTransition(async () => {
      const result = await addImageToGalleryAlbum(album.id, imageId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        <span>
          Added to{" "}
          <Link href={`/albums/${album.slug}`} className="underline">
            {album.title}
          </Link>
        </span>
      )
      setAlbums((prev) =>
        (prev ?? []).map((item) =>
          item.id === album.id
            ? { ...item, photo_count: item.photo_count + 1 }
            : item
        )
      )
      setOpen(false)
    })
  }

  const createAndAdd = () => {
    const title = normalizeGalleryAlbumTitle(draftTitle)
    if (!title) {
      toast.error("Give the album a name with letters or numbers.")
      return
    }
    startTransition(async () => {
      const created = await createGalleryAlbum({ title })
      if (!created.ok) {
        toast.error(created.error)
        return
      }
      const added = await addImageToGalleryAlbum(created.data.id, imageId)
      if (!added.ok) {
        toast.error(added.error)
        return
      }
      setAlbums((prev) => [
        {
          id: created.data.id,
          title: created.data.title,
          slug: created.data.slug,
          photo_count: 1,
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
        </span>
      )
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
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(gallerySans(), "h-8 gap-1.5 text-[11px] uppercase")}
        >
          <IconAlbum className="size-3.5" aria-hidden />
          Add to album
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={gallerySans()}>Add to album</DialogTitle>
          <DialogDescription>
            Curate this shot into one of your collections. Share links live at{" "}
            <span className="text-foreground">/albums/&lt;slug&gt;</span>.
          </DialogDescription>
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
                    disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
              aria-label="Create album and add photo"
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
