"use client"

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
} from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconVolume,
  IconVolumeOff,
  IconX,
} from "@tabler/icons-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryKeyboardCheatsheet } from "@/app/_components/gallery-keyboard-cheatsheet"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { resolveLightboxSwipe } from "@/lib/gallery/lightbox-gestures"
import {
  GALLERY_SLIDESHOW_DEFAULT_MS,
  clampSlideshowStartIndex,
  nextSlideshowIndex,
  prevSlideshowIndex,
  readStoredSlideshowIntervalMs,
  slideshowIndexFromDigitKey,
  slideshowIndexFromProgress,
  writeStoredSlideshowIntervalMs,
  type GallerySlideshowPhoto,
} from "@/lib/gallery/slideshow"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

function mediaUrl(photo: GallerySlideshowPhoto): string {
  if (photo.media_type === "video") {
    return photo.poster_path
      ? getGalleryThumbUrl(photo.poster_path, 1600)
      : getGalleryThumbUrl(photo.image_path, 1600)
  }
  return getGalleryImageUrl(photo.image_path)
}

export function AlbumSlideshow({
  photos,
  albumTitle,
  open,
  onOpenChange,
  startIndex = 0,
}: {
  photos: GallerySlideshowPhoto[]
  albumTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  startIndex?: number
}) {
  const [index, setIndex] = useState(() =>
    clampSlideshowStartIndex(startIndex, photos.length)
  )
  const [paused, setPaused] = useState(false)
  const [intervalMs, setIntervalMs] = useState(GALLERY_SLIDESHOW_DEFAULT_MS)
  const [videoMuted, setVideoMuted] = useState(true)
  const [mediaFailed, setMediaFailed] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    if (!open) return
    setIndex(clampSlideshowStartIndex(startIndex, photos.length))
    setPaused(false)
    setIntervalMs(readStoredSlideshowIntervalMs(window.localStorage))
    setVideoMuted(true)
    setMediaFailed(false)
    touchStartRef.current = null
    suppressClickRef.current = false
  }, [open, startIndex, photos.length])

  useEffect(() => {
    setMediaFailed(false)
  }, [index])

  const bumpInterval = (delta: number) => {
    setIntervalMs((ms) =>
      writeStoredSlideshowIntervalMs(ms + delta, window.localStorage)
    )
  }

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const swipe = resolveLightboxSwipe(
      touch.clientX - start.x,
      touch.clientY - start.y
    )
    if (swipe === "next" && photos.length > 1) {
      suppressClickRef.current = true
      setIndex((current) => nextSlideshowIndex(current, photos.length))
      return
    }
    if (swipe === "prev" && photos.length > 1) {
      suppressClickRef.current = true
      setIndex((current) => prevSlideshowIndex(current, photos.length))
      return
    }
    if (swipe == null) {
      const current = photos[index]
      if (current?.media_type === "video") return
      suppressClickRef.current = true
      setPaused((value) => !value)
    }
  }

  const togglePauseFromPointer = (event: { target: EventTarget | null }) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest("button, video, a")) return
    const current = photos[index]
    if (current?.media_type === "video") return
    setPaused((value) => !value)
  }

  const seekFromClientX = (
    clientX: number,
    target: EventTarget & HTMLElement
  ) => {
    const rect = target.getBoundingClientRect()
    if (rect.width <= 0) return
    setIndex(
      slideshowIndexFromProgress(
        (clientX - rect.left) / rect.width,
        photos.length
      )
    )
  }

  const onProgressPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    setPaused(true)
    seekFromClientX(event.clientX, target)
  }

  const onProgressPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    seekFromClientX(event.clientX, event.currentTarget)
  }

  const onProgressPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    if (!open || photos.length < 2) return
    const next = photos[nextSlideshowIndex(index, photos.length)]
    const prev = photos[prevSlideshowIndex(index, photos.length)]
    for (const photo of [next, prev]) {
      if (!photo) continue
      const img = new window.Image()
      img.src = mediaUrl(photo)
    }
  }, [index, open, photos])

  useEffect(() => {
    if (!open || paused || photos.length < 2) return
    const current = photos[index]
    if (current?.media_type === "video") return
    const id = window.setInterval(() => {
      setIndex((current) => nextSlideshowIndex(current, photos.length))
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [open, paused, photos, index, intervalMs])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.key === " " || event.code === "Space") {
        event.preventDefault()
        setPaused((value) => !value)
        return
      }
      if (event.key === "m" || event.key === "M") {
        const current = photos[index]
        if (current?.media_type !== "video") return
        event.preventDefault()
        setVideoMuted((value) => !value)
        return
      }
      if (event.key === "[" || event.key === "-") {
        event.preventDefault()
        bumpInterval(-500)
        return
      }
      if (event.key === "]" || event.key === "=" || event.key === "+") {
        event.preventDefault()
        bumpInterval(500)
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
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        setIndex(0)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        setIndex(Math.max(0, photos.length - 1))
        return
      }
      const digitIndex = slideshowIndexFromDigitKey(event.key, photos.length)
      if (digitIndex != null) {
        event.preventDefault()
        setIndex(digitIndex)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, photos, index])

  if (photos.length === 0) return null

  const photo = photos[index] ?? photos[0]
  if (!photo) return null

  const autoAdvanceActive =
    open && !paused && photos.length > 1 && photo.media_type !== "video"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "fixed inset-0 z-50 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-zinc-950 p-0 text-zinc-50 shadow-none",
          "data-[state=closed]:animate-none data-[state=open]:animate-none"
        )}
      >
        <DialogTitle className="sr-only">Slideshow · {albumTitle}</DialogTitle>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {photo?.name ?? albumTitle}
          {photos.length > 0 ? ` · slide ${index + 1} of ${photos.length}` : ""}
          {paused ? " · paused" : ""}
        </p>

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
              {` · ${(intervalMs / 1000).toFixed(1)}s`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {photo.media_type === "video" ? (
              <button
                type="button"
                onClick={() => setVideoMuted((value) => !value)}
                className={cn(
                  gallerySans(),
                  "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10"
                )}
                aria-pressed={videoMuted}
                aria-label={videoMuted ? "Unmute video" : "Mute video"}
              >
                {videoMuted ? (
                  <IconVolumeOff className="size-5" aria-hidden />
                ) : (
                  <IconVolume className="size-5" aria-hidden />
                )}
              </button>
            ) : null}
            <GalleryKeyboardCheatsheet slideshowOpen dark />
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              className={cn(
                gallerySans(),
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10"
              )}
              aria-pressed={paused}
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
              onClick={() => onOpenChange(false)}
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

        {photos.length > 1 ? (
          <button
            type="button"
            role="slider"
            aria-label="Slideshow progress"
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={photos.length}
            aria-valuenow={index + 1}
            className="group relative mx-4 h-3 shrink-0 touch-none sm:mx-6"
            onPointerDown={onProgressPointerDown}
            onPointerMove={onProgressPointerMove}
            onPointerUp={onProgressPointerUp}
            onPointerCancel={onProgressPointerUp}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault()
                event.stopPropagation()
                setIndex((current) =>
                  nextSlideshowIndex(current, photos.length)
                )
                return
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault()
                event.stopPropagation()
                setIndex((current) =>
                  prevSlideshowIndex(current, photos.length)
                )
                return
              }
              if (event.key === "Home") {
                event.preventDefault()
                event.stopPropagation()
                setIndex(0)
                return
              }
              if (event.key === "End") {
                event.preventDefault()
                event.stopPropagation()
                setIndex(Math.max(0, photos.length - 1))
                return
              }
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              seekFromClientX(rect.left + rect.width / 2, event.currentTarget)
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/15 transition group-hover:h-1"
            />
            <span
              aria-hidden
              className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full bg-white/45 transition group-hover:h-1"
              style={{
                width: `${(index / photos.length) * 100}%`,
              }}
            />
            <span
              aria-hidden
              key={`${index}-${intervalMs}-${autoAdvanceActive ? "go" : "stop"}`}
              className={cn(
                "absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/85 transition group-hover:h-1",
                autoAdvanceActive && "gallery-slideshow-segment-fill"
              )}
              style={{
                left: `${(index / photos.length) * 100}%`,
                width: `${(1 / photos.length) * 100}%`,
                transform: autoAdvanceActive ? undefined : "scaleX(1)",
                transformOrigin: "left center",
                animationDuration: autoAdvanceActive
                  ? `${intervalMs}ms`
                  : undefined,
              }}
            />
          </button>
        ) : null}

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-4 pb-8 sm:px-10"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={togglePauseFromPointer}
        >
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() =>
                  setIndex((current) =>
                    prevSlideshowIndex(current, photos.length)
                  )
                }
                className={cn(
                  "absolute top-1/2 left-2 z-10 hidden -translate-y-1/2 sm:inline-flex",
                  "size-11 items-center justify-center rounded-full text-zinc-200",
                  "bg-black/25 hover:bg-black/45"
                )}
              >
                <IconChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() =>
                  setIndex((current) =>
                    nextSlideshowIndex(current, photos.length)
                  )
                }
                className={cn(
                  "absolute top-1/2 right-2 z-10 hidden -translate-y-1/2 sm:inline-flex",
                  "size-11 items-center justify-center rounded-full text-zinc-200",
                  "bg-black/25 hover:bg-black/45"
                )}
              >
                <IconChevronRight className="size-6" aria-hidden />
              </button>
            </>
          ) : null}
          {mediaFailed ? (
            <div
              className={cn(
                gallerySans(),
                "flex max-w-sm flex-col items-center gap-3 px-6 text-center text-sm text-zinc-400"
              )}
            >
              <span>This slide could not be loaded.</span>
              {photos.length > 1 ? (
                <span className="text-xs text-zinc-500">
                  Use ← → to skip to another shot.
                </span>
              ) : null}
            </div>
          ) : photo.media_type === "video" ? (
            <video
              key={photo.image_id}
              src={getGalleryImageUrl(photo.image_path)}
              poster={
                photo.poster_path
                  ? getGalleryThumbUrl(photo.poster_path, 1600)
                  : undefined
              }
              className="max-h-full max-w-full object-contain"
              controls
              playsInline
              autoPlay
              muted={videoMuted}
              onError={() => setMediaFailed(true)}
              onEnded={() => {
                if (pausedRef.current || photos.length < 2) return
                setIndex((current) =>
                  nextSlideshowIndex(current, photos.length)
                )
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.image_id}
              src={mediaUrl(photo)}
              alt={photo.name}
              className="max-h-full max-w-full object-contain"
              draggable={false}
              onError={() => setMediaFailed(true)}
            />
          )}
        </div>

        <p
          className={cn(
            gallerySans(),
            "px-4 pb-4 text-center text-[11px] text-zinc-500 sm:px-6"
          )}
        >
          {photo.name} · click/Space pause · [ ] speed · ← → / swipe · Home/End
          · Esc close
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function AlbumSlideshowButton({
  photos,
  albumTitle,
  className,
  triggerLabel = "Slideshow",
  startIndex = 0,
}: {
  photos: GallerySlideshowPhoto[]
  albumTitle: string
  className?: string
  triggerLabel?: string
  startIndex?: number
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      queueMicrotask(() => triggerRef.current?.focus())
    }
  }

  if (photos.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={open}
        aria-busy={open || undefined}
        aria-expanded={open}
        className={className}
      >
        {triggerLabel}
      </button>
      <AlbumSlideshow
        photos={photos}
        albumTitle={albumTitle}
        open={open}
        onOpenChange={onOpenChange}
        startIndex={startIndex}
      />
    </>
  )
}
