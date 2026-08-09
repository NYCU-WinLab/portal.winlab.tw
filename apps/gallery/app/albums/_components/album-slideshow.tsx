"use client"

import { useEffect, useState } from "react"
import { IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import type { GalleryAlbumPhoto } from "@/lib/gallery/albums"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import {
  GALLERY_SLIDESHOW_DEFAULT_MS,
  nextSlideshowIndex,
  prevSlideshowIndex,
} from "@/lib/gallery/slideshow"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

function mediaUrl(photo: GalleryAlbumPhoto): string {
  if (photo.media_type === "video") {
    return photo.poster_path
      ? getGalleryThumbUrl(photo.poster_path, 1600)
      : getGalleryThumbUrl(photo.image_path, 1600)
  }
  return getGalleryImageUrl(photo.image_path)
}

export function AlbumSlideshowButton({
  photos,
  albumTitle,
  className,
}: {
  photos: GalleryAlbumPhoto[]
  albumTitle: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setPaused(false)
  }, [open])

  useEffect(() => {
    if (!open || paused || photos.length < 2) return
    const id = window.setInterval(() => {
      setIndex((current) => nextSlideshowIndex(current, photos.length))
    }, GALLERY_SLIDESHOW_DEFAULT_MS)
    return () => window.clearInterval(id)
  }, [open, paused, photos.length])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.key === " " || event.code === "Space") {
        event.preventDefault()
        setPaused((value) => !value)
        return
      }
      if (
        event.key === "ArrowRight" ||
        event.key === "j" ||
        event.key === "J"
      ) {
        event.preventDefault()
        setIndex((current) => nextSlideshowIndex(current, photos.length))
        return
      }
      if (event.key === "ArrowLeft" || event.key === "k" || event.key === "K") {
        event.preventDefault()
        setIndex((current) => prevSlideshowIndex(current, photos.length))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, photos.length])

  if (photos.length === 0) return null

  const photo = photos[index] ?? photos[0]
  if (!photo) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Slideshow
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "fixed inset-0 z-50 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-zinc-950 p-0 text-zinc-50 shadow-none",
            "data-[state=closed]:animate-none data-[state=open]:animate-none"
          )}
        >
          <DialogTitle className="sr-only">
            Slideshow · {albumTitle}
          </DialogTitle>

          <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p
                className={cn(
                  gallerySerif(),
                  "truncate text-lg text-zinc-50 sm:text-xl"
                )}
              >
                {albumTitle}
              </p>
              <p
                className={cn(
                  gallerySans(),
                  "text-[11px] tracking-wide text-zinc-400 uppercase"
                )}
              >
                {index + 1} / {photos.length}
                {paused ? " · paused" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                className={cn(
                  gallerySans(),
                  "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10"
                )}
                aria-label={paused ? "Resume slideshow" : "Pause slideshow"}
              >
                {paused ? (
                  <IconPlayerPlay className="size-5" aria-hidden />
                ) : (
                  <IconPlayerPause className="size-5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  gallerySans(),
                  "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10"
                )}
                aria-label="Close slideshow"
              >
                <IconX className="size-5" aria-hidden />
              </button>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-8 sm:px-10">
            {photo.media_type === "video" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.image_id}
                src={mediaUrl(photo)}
                alt={photo.name}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.image_id}
                src={mediaUrl(photo)}
                alt={photo.name}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            )}
          </div>

          <p
            className={cn(
              gallerySans(),
              "px-4 pb-4 text-center text-[11px] text-zinc-500 sm:px-6"
            )}
          >
            {photo.name} · Space pause · ← → step · Esc close
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
