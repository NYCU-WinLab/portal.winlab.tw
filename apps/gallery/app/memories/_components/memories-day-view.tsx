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
import { MemoriesYearSections } from "@/app/memories/_components/memories-year-sections"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { resolveLightboxSwipe } from "@/lib/gallery/lightbox-gestures"
import { adjacentListId, edgeListId } from "@/lib/gallery/lightbox-nav"
import type { GalleryMemoryYearGroup } from "@/lib/gallery/memories"
import {
  findSlideshowIndexByImageId,
  type GallerySlideshowPhoto,
} from "@/lib/gallery/slideshow"
import {
  describeNextPhotoAriaLabel,
  describePreviousPhotoAriaLabel,
} from "@/lib/gallery/slideshow-labels"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"
import { setMemoriesOverlayState } from "@/lib/gallery/memories-overlay-store"

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
  const photoButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const lightboxReturnIdRef = useRef<string | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const onSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    if (!open) {
      const returnId = lightboxReturnIdRef.current
      lightboxReturnIdRef.current = null
      queueMicrotask(() => {
        if (returnId) {
          photoButtonRefs.current.get(returnId)?.focus()
          return
        }
        slideshowButtonRef.current?.focus()
      })
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
  const photoIds = useMemo(
    () => slideshowPhotos.map((photo) => photo.image_id),
    [slideshowPhotos]
  )
  const activeIndexLabel =
    active && photoIds.length > 1
      ? `${photoIds.indexOf(active.id) + 1} of ${photoIds.length}`
      : null

  useEffect(() => {
    setMemoriesOverlayState({
      lightboxOpen: Boolean(active),
      slideshowOpen,
    })
    return () => {
      setMemoriesOverlayState({ lightboxOpen: false, slideshowOpen: false })
    }
  }, [active, slideshowOpen])

  const goLightbox = (direction: "prev" | "next") => {
    if (!openId) return
    const nextId = adjacentListId(photoIds, openId, direction)
    if (!nextId) return
    setLightboxFailed(false)
    setOpenId(nextId)
  }

  useEffect(() => {
    if (!openId || photoIds.length <= 1 || slideshowOpen) return
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
  }, [openId, photoIds, slideshowOpen])

  const openSlideshowAtIndex = (index: number, returnPhotoId?: string) => {
    setSlideshowStart(index)
    lightboxReturnIdRef.current = returnPhotoId ?? openId
    setOpenId(null)
    setSlideshowOpen(true)
  }

  const openSlideshowFromPhoto = (imageId: string) => {
    openSlideshowAtIndex(
      findSlideshowIndexByImageId(slideshowPhotos, imageId),
      imageId
    )
  }

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <MemoriesYearSections
        groups={groups}
        currentYear={currentYear}
        canSlideshow={slideshowPhotos.length > 0}
        slideshowOpen={slideshowOpen}
        onOpenPhoto={(imageId) => {
          setLightboxFailed(false)
          setOpenId(imageId)
        }}
        onStartSlideshow={(startIndex) => openSlideshowAtIndex(startIndex)}
        registerPhotoButton={(imageId, node) => {
          if (node) photoButtonRefs.current.set(imageId, node)
          else photoButtonRefs.current.delete(imageId)
        }}
      />

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
              <DialogTitle className="sr-only">
                {active.name}
                {activeIndexLabel ? ` · ${activeIndexLabel}` : ""}
              </DialogTitle>
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {active.name}
                {activeIndexLabel ? ` · ${activeIndexLabel}` : ""}
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
