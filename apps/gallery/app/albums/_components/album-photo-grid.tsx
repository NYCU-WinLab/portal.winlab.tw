"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

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
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { resolveLightboxSwipe } from "@/lib/gallery/lightbox-gestures"
import { adjacentListId, edgeListId } from "@/lib/gallery/lightbox-nav"
import { describeAlbumLightboxPositionLabel } from "@/lib/gallery/lightbox-position-label"
import {
  findSlideshowIndexByImageId,
  type GallerySlideshowPhoto,
} from "@/lib/gallery/slideshow"
import {
  describeNextPhotoAriaLabel,
  describeNextSlideAriaLabel,
  describePreviousPhotoAriaLabel,
  describePreviousSlideAriaLabel,
} from "@/lib/gallery/slideshow-labels"
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
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const [slideshowStart, setSlideshowStart] = useState(0)
  const photoButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const slideshowReturnIdRef = useRef<string | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const active = photos.find((p) => p.image_id === openId) ?? null
  const photoIds = useMemo(() => photos.map((p) => p.image_id), [photos])
  const activeIndexLabel = active
    ? describeAlbumLightboxPositionLabel(
        active.name,
        photoIds.indexOf(active.image_id),
        photoIds.length
      )
    : null

  const goLightbox = (direction: "prev" | "next") => {
    if (!openId) return
    const nextId = adjacentListId(photoIds, openId, direction)
    if (!nextId) return
    setLightboxFailed(false)
    setOpenId(nextId)
  }

  useEffect(() => {
    if (!openId || photoIds.length <= 1) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "ArrowLeft" || event.key === "k" || event.key === "K") {
        event.preventDefault()
        const nextId = adjacentListId(photoIds, openId, "prev")
        if (!nextId) return
        setLightboxFailed(false)
        setOpenId(nextId)
        return
      }
      if (
        event.key === "ArrowRight" ||
        event.key === "j" ||
        event.key === "J"
      ) {
        event.preventDefault()
        const nextId = adjacentListId(photoIds, openId, "next")
        if (!nextId) return
        setLightboxFailed(false)
        setOpenId(nextId)
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        const first = edgeListId(photoIds, "first")
        if (!first || first === openId) return
        setLightboxFailed(false)
        setOpenId(first)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        const last = edgeListId(photoIds, "last")
        if (!last || last === openId) return
        setLightboxFailed(false)
        setOpenId(last)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [openId, photoIds])

  const handleSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    if (!open) {
      // Lightbox already closed — return keyboard focus to the polaroid.
      const returnId = slideshowReturnIdRef.current
      slideshowReturnIdRef.current = null
      queueMicrotask(() => {
        if (returnId) photoButtonRefs.current.get(returnId)?.focus()
      })
    }
  }
  const slideshowPhotos = useMemo(
    () =>
      photos.map(
        (photo): GallerySlideshowPhoto => ({
          image_id: photo.image_id,
          name: photo.name,
          image_path: photo.image_path,
          media_type: photo.media_type,
          poster_path: photo.poster_path,
        })
      ),
    [photos]
  )

  const startSlideshowAt = (imageId: string) => {
    setSlideshowStart(findSlideshowIndexByImageId(slideshowPhotos, imageId))
    slideshowReturnIdRef.current = imageId
    setOpenId(null)
    handleSlideshowOpenChange(true)
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4">
        {photos.map((photo) => (
          <li key={photo.image_id}>
            <button
              type="button"
              ref={(node) => {
                if (node) photoButtonRefs.current.set(photo.image_id, node)
                else photoButtonRefs.current.delete(photo.image_id)
              }}
              onClick={() => {
                setLightboxFailed(false)
                setOpenId(photo.image_id)
              }}
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
          if (!open) {
            const returnId = openId
            setOpenId(null)
            setLightboxFailed(false)
            queueMicrotask(() => {
              if (returnId) photoButtonRefs.current.get(returnId)?.focus()
            })
          }
        }}
      >
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          {active ? (
            <div
              className="relative overflow-hidden rounded-lg bg-[#f7f7f5] shadow-2xl"
              onTouchStart={(event) => {
                const touch = event.touches[0]
                if (!touch) return
                touchStartRef.current = { x: touch.clientX, y: touch.clientY }
              }}
              onTouchEnd={(event) => {
                if (!touchStartRef.current || photoIds.length <= 1) return
                const touch = event.changedTouches[0]
                if (!touch) return
                const swipe = resolveLightboxSwipe(
                  touch.clientX - touchStartRef.current.x,
                  touch.clientY - touchStartRef.current.y
                )
                touchStartRef.current = null
                if (swipe === "prev") goLightbox("prev")
                else if (swipe === "next") goLightbox("next")
              }}
            >
              <DialogTitle className="sr-only">{activeIndexLabel}</DialogTitle>
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {activeIndexLabel}
              </p>
              {photoIds.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label={describePreviousPhotoAriaLabel()}
                    aria-keyshortcuts="ArrowLeft"
                    onClick={() => goLightbox("prev")}
                    className={cn(
                      "absolute top-[min(38%,12rem)] left-2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full",
                      "bg-black/30 text-white hover:bg-black/50"
                    )}
                  >
                    <IconChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={describeNextPhotoAriaLabel()}
                    aria-keyshortcuts="ArrowRight"
                    onClick={() => goLightbox("next")}
                    className={cn(
                      "absolute top-[min(38%,12rem)] right-2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full",
                      "bg-black/30 text-white hover:bg-black/50"
                    )}
                  >
                    <IconChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              ) : null}
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
                  src={mediaFor(active)}
                  poster={
                    active.poster_path
                      ? getGalleryImageUrl(active.poster_path)
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
                  src={mediaFor(active)}
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
        onOpenChange={handleSlideshowOpenChange}
        startIndex={slideshowStart}
      />
    </>
  )
}
