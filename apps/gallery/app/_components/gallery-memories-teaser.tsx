"use client"

import Link from "next/link"
import { useRef, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { AlbumSlideshow } from "@/app/albums/_components/album-slideshow"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import type { GalleryMemoryPhoto } from "@/lib/gallery/memories"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

/** Compact home teaser when past-year shots match today. */
export function GalleryMemoriesTeaser({
  photos,
  dayLabel,
}: {
  photos: GalleryMemoryPhoto[]
  dayLabel: string
}) {
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const slideshowButtonRef = useRef<HTMLButtonElement>(null)

  const onSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    if (!open) {
      // Dialog stole focus — put keyboard users back on the trigger.
      queueMicrotask(() => slideshowButtonRef.current?.focus())
    }
  }

  if (photos.length === 0) return null

  const slideshowPhotos = photos.map((photo) => ({
    image_id: photo.id,
    name: photo.name,
    image_path: photo.image_path,
    media_type: photo.media_type,
    poster_path: photo.poster_path,
  }))

  const preview = photos.slice(0, 3)
  const extra = Math.max(0, photos.length - preview.length)

  return (
    <aside
      className={cn(
        "gallery-memories-teaser mb-8 rounded-sm border border-zinc-900/10 bg-[#f7f7f5]/70 px-4 py-4 shadow-[0_16px_36px_-30px_rgba(24,24,27,0.55)] sm:mb-10 sm:px-5 sm:py-5"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              gallerySans(),
              "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
            )}
          >
            On this day
          </p>
          <p
            className={cn(gallerySerif(), "text-xl leading-tight sm:text-2xl")}
          >
            Memories from {dayLabel}
          </p>
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            {photos.length === 1
              ? "One polaroid from a prior year."
              : `${photos.length} polaroids from prior years.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-3">
            {preview.map((photo) => {
              const path =
                photo.media_type === "video" && photo.poster_path
                  ? photo.poster_path
                  : photo.image_path
              return (
                // eslint-disable-next-line @next/next/no-img-element -- tiny teaser strip
                <img
                  key={photo.id}
                  src={getGalleryThumbUrl(path, 96)}
                  alt=""
                  className="size-12 rounded-sm object-cover ring-2 ring-[#f7f7f5] sm:size-14"
                />
              )
            })}
            {extra > 0 ? (
              <span
                className={cn(
                  gallerySans(),
                  "flex size-12 items-center justify-center rounded-sm bg-zinc-900/8 text-xs text-muted-foreground ring-2 ring-[#f7f7f5] sm:size-14"
                )}
              >
                +{extra}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <button
              ref={slideshowButtonRef}
              type="button"
              onClick={() => setSlideshowOpen(true)}
              className={cn(
                gallerySans(),
                "inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-xs shadow-xs",
                "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Slideshow
            </button>
            <Link
              href="/memories"
              className={cn(
                gallerySans(),
                "text-sm underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
              )}
            >
              Open
            </Link>
          </div>
        </div>
      </div>

      <AlbumSlideshow
        photos={slideshowPhotos}
        albumTitle={`Memories · ${dayLabel}`}
        open={slideshowOpen}
        onOpenChange={onSlideshowOpenChange}
      />
    </aside>
  )
}
