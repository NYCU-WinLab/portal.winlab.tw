"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { AlbumSlideshow } from "@/app/albums/_components/album-slideshow"
import {
  galleryPolaroidClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import type { GalleryAlbumPhoto } from "@/lib/gallery/albums"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

function thumbFor(photo: GalleryAlbumPhoto): string {
  if (photo.media_type === "video" && photo.poster_path) {
    return getGalleryThumbUrl(photo.poster_path)
  }
  return getGalleryThumbUrl(photo.image_path)
}

function mediaFor(photo: GalleryAlbumPhoto): string {
  return getGalleryImageUrl(photo.image_path)
}

function AlbumThumb({
  photo,
  className,
}: {
  photo: GalleryAlbumPhoto
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-neutral-200/80 to-neutral-300/70 px-2 text-center",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/mark.png"
          alt=""
          width={32}
          height={32}
          className="size-7 object-contain opacity-40 grayscale"
          draggable={false}
        />
        <span
          className={cn(
            gallerySans(),
            "text-[10px] tracking-wide text-zinc-500/90"
          )}
        >
          Preview unavailable
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbFor(photo)}
      alt={photo.name}
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export function GalleryAlbumPhotoGrid({
  photos,
  albumTitle,
}: {
  photos: GalleryAlbumPhoto[]
  albumTitle: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const [slideshowStart, setSlideshowStart] = useState(0)
  const active = photos.find((p) => p.image_id === openId) ?? null
  const slideshowPhotos = useMemo(
    () =>
      photos.map((photo) => ({
        image_id: photo.image_id,
        name: photo.name,
        image_path: photo.image_path,
        media_type: photo.media_type,
        poster_path: photo.poster_path,
      })),
    [photos]
  )

  const startSlideshowAt = (imageId: string) => {
    const index = photos.findIndex((photo) => photo.image_id === imageId)
    setSlideshowStart(index >= 0 ? index : 0)
    setOpenId(null)
    setSlideshowOpen(true)
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
        {photos.map((photo) => (
          <li key={photo.image_id}>
            <button
              type="button"
              onClick={() => setOpenId(photo.image_id)}
              className="group/polaroid block w-full text-left focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <figure className={cn(galleryPolaroidClass(), "p-2.5 pb-3")}>
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1px] bg-zinc-200/80">
                  <AlbumThumb
                    photo={photo}
                    className="transition-transform duration-500 ease-out group-hover/polaroid:scale-[1.03]"
                  />
                </div>
                <figcaption
                  className={cn(
                    gallerySans(),
                    "mt-2 truncate px-0.5 text-[11px] text-muted-foreground"
                  )}
                >
                  {photo.name}
                </figcaption>
              </figure>
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
      >
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          {active ? (
            <div className="overflow-hidden rounded-lg bg-[#f7f7f5] shadow-2xl">
              <DialogTitle className="sr-only">{active.name}</DialogTitle>
              {active.media_type === "video" ? (
                <video
                  src={mediaFor(active)}
                  poster={
                    active.poster_path
                      ? getGalleryImageUrl(active.poster_path)
                      : undefined
                  }
                  controls
                  playsInline
                  className="max-h-[75dvh] w-full bg-zinc-900 object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaFor(active)}
                  alt={active.name}
                  className="max-h-[75dvh] w-full object-contain"
                />
              )}
              <div className="space-y-2 px-5 py-4">
                <p className={cn(gallerySerif(), "text-xl text-foreground")}>
                  {active.name}
                </p>
                <p
                  className={cn(gallerySans(), "text-xs text-muted-foreground")}
                >
                  by {active.uploader_name}
                  {active.created_by ? (
                    <>
                      <span aria-hidden> · </span>
                      <Link
                        href={`/?photo=${active.image_id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        Open on wall
                      </Link>
                    </>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => startSlideshowAt(active.image_id)}
                  className={cn(
                    gallerySans(),
                    "text-xs text-foreground underline-offset-2 hover:underline"
                  )}
                >
                  Slideshow from here
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlbumSlideshow
        photos={slideshowPhotos}
        albumTitle={albumTitle}
        open={slideshowOpen}
        onOpenChange={setSlideshowOpen}
        startIndex={slideshowStart}
      />
    </>
  )
}
