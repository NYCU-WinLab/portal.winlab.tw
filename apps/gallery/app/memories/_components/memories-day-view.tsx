"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { AlbumSlideshow } from "@/app/albums/_components/album-slideshow"
import { MemoriesYearSections } from "@/app/memories/_components/memories-year-sections"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import type { GalleryMemoryYearGroup } from "@/lib/gallery/memories"
import {
  findSlideshowIndexByImageId,
  type GallerySlideshowPhoto,
} from "@/lib/gallery/slideshow"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

export function MemoriesDayView({
  groups,
  currentYear,
  slideshowPhotos,
  slideshowTitle,
}: {
  groups: GalleryMemoryYearGroup[]
  currentYear: number
  slideshowPhotos: GallerySlideshowPhoto[]
  slideshowTitle: string
}) {
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const [slideshowStart, setSlideshowStart] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const slideshowButtonRef = useRef<HTMLButtonElement>(null)

  const onSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    if (!open) {
      queueMicrotask(() => slideshowButtonRef.current?.focus())
    }
  }

  const photoById = useMemo(() => {
    const map = new Map<string, GalleryMemoryYearGroup["photos"][number]>()
    for (const group of groups) {
      for (const photo of group.photos) {
        map.set(photo.id, photo)
      }
    }
    return map
  }, [groups])

  const active = openId ? (photoById.get(openId) ?? null) : null

  const openSlideshowAtIndex = (index: number) => {
    setSlideshowStart(index)
    setOpenId(null)
    setSlideshowOpen(true)
  }

  const openSlideshowFromPhoto = (imageId: string) => {
    openSlideshowAtIndex(findSlideshowIndexByImageId(slideshowPhotos, imageId))
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      {slideshowPhotos.length > 0 ? (
        <button
          ref={slideshowButtonRef}
          type="button"
          onClick={() => openSlideshowAtIndex(0)}
          disabled={slideshowOpen}
          aria-busy={slideshowOpen || undefined}
          aria-expanded={slideshowOpen}
          className={cn(
            gallerySans(),
            "inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
            "hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          )}
        >
          Slideshow
        </button>
      ) : null}

      <MemoriesYearSections
        groups={groups}
        currentYear={currentYear}
        canSlideshow={slideshowPhotos.length > 0}
        onOpenPhoto={(imageId) => {
          setLightboxFailed(false)
          setOpenId(imageId)
        }}
        onStartSlideshow={openSlideshowAtIndex}
      />

      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null)
            setLightboxFailed(false)
          }
        }}
      >
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          {active ? (
            <div className="overflow-hidden rounded-lg bg-[#f7f7f5] shadow-2xl">
              <DialogTitle className="sr-only">{active.name}</DialogTitle>
              {lightboxFailed ? (
                <div
                  className={cn(
                    gallerySans(),
                    "flex min-h-[40dvh] flex-col items-center justify-center gap-2 bg-zinc-200/70 px-6 text-center text-sm text-zinc-600"
                  )}
                >
                  <span>Preview unavailable</span>
                  <span className="text-xs text-muted-foreground">
                    Open on the wall or start the slideshow to keep moving.
                  </span>
                </div>
              ) : active.media_type === "video" ? (
                <video
                  src={getGalleryImageUrl(active.image_path)}
                  poster={
                    active.poster_path
                      ? getGalleryThumbUrl(active.poster_path)
                      : undefined
                  }
                  controls
                  playsInline
                  className="max-h-[75dvh] w-full bg-zinc-900 object-contain"
                  onError={() => setLightboxFailed(true)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getGalleryImageUrl(active.image_path)}
                  alt={active.name}
                  className="max-h-[75dvh] w-full object-contain"
                  onError={() => setLightboxFailed(true)}
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
                  <span aria-hidden> · </span>
                  <Link
                    href={`/?photo=${encodeURIComponent(active.id)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    Open on wall
                  </Link>
                </p>
                {slideshowPhotos.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openSlideshowFromPhoto(active.id)}
                    className={cn(
                      gallerySans(),
                      "text-xs text-foreground underline-offset-2 hover:underline"
                    )}
                  >
                    Slideshow from here
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlbumSlideshow
        photos={slideshowPhotos}
        albumTitle={slideshowTitle}
        open={slideshowOpen}
        onOpenChange={onSlideshowOpenChange}
        startIndex={slideshowStart}
      />
    </div>
  )
}
