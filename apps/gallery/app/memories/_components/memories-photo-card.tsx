"use client"

import { useState } from "react"
import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { formatUploadedDate } from "@/lib/gallery/format-uploaded-at"
import {
  memoriesYearsAgoLabel,
  type GalleryMemoryPhoto,
} from "@/lib/gallery/memories"
import { getPolaroidFrame, getPolaroidTape } from "@/lib/gallery/polaroid-frame"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

export function MemoriesPhotoCard({
  photo,
  currentYear,
  onOpen,
  onFocusPhoto,
  focused = false,
  buttonRef,
}: {
  photo: GalleryMemoryPhoto
  currentYear: number
  onOpen: () => void
  onFocusPhoto?: () => void
  focused?: boolean
  buttonRef?: (node: HTMLButtonElement | null) => void
}) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const frame = getPolaroidFrame(photo.id)
  const tape = getPolaroidTape(photo.id)
  const thumbPath =
    photo.media_type === "video" && photo.poster_path
      ? photo.poster_path
      : photo.image_path

  return (
    <article
      className={cn(
        "gallery-wall-card group relative mx-auto w-full",
        frame.maxWidthClass
      )}
    >
      <button
        type="button"
        ref={buttonRef}
        onClick={onOpen}
        onFocus={onFocusPhoto}
        className={cn(
          "block w-full text-left focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:outline-none",
          focused && "ring-2 ring-zinc-900/30"
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden bg-[#f7f7f5] p-3 pb-10 shadow-[0_1px_2px_rgba(24,24,27,0.05),0_6px_16px_-10px_rgba(24,24,27,0.2)] ring-1 ring-zinc-900/8 transition duration-300",
            "group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_4px_rgba(24,24,27,0.06),0_10px_22px_-12px_rgba(24,24,27,0.26)]"
          )}
        >
          {tape === "tl" || tape === "tr" ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-2 z-10 h-3 w-10 -rotate-6 bg-amber-100/90 shadow-sm ring-1 ring-amber-900/10",
                tape === "tl" ? "left-3" : "right-3 rotate-6"
              )}
            />
          ) : null}
          {tape === "clip" ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 left-1/2 z-10 h-4 w-3 -translate-x-1/2 rounded-[1px] bg-zinc-400/80 shadow-sm ring-1 ring-zinc-700/20"
            />
          ) : null}

          <div
            className={cn(
              "relative overflow-hidden bg-zinc-200",
              frame.aspectClass
            )}
          >
            {thumbFailed ? (
              <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 px-3 text-center">
                <Image
                  src="/icons/mark.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 object-contain opacity-40 grayscale"
                  draggable={false}
                  unoptimized
                />
                <span
                  className={cn(
                    gallerySans(),
                    "text-[11px] tracking-wide text-zinc-500/90"
                  )}
                >
                  Preview unavailable
                </span>
              </div>
            ) : (
              <>
                <Image
                  src={getGalleryThumbUrl(thumbPath)}
                  alt={photo.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 70vw, 240px"
                  unoptimized
                  onError={() => setThumbFailed(true)}
                />
                {photo.media_type === "video" ? (
                  <div
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/25 via-transparent to-transparent"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-white/85 text-foreground shadow">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="absolute inset-x-3 bottom-2.5 space-y-0.5">
            <p
              className={cn(
                gallerySerif(),
                "truncate text-[15px] leading-tight text-foreground"
              )}
            >
              {photo.name}
            </p>
            <p
              className={cn(
                gallerySans(),
                "truncate text-[10px] tracking-wide text-muted-foreground uppercase"
              )}
            >
              {memoriesYearsAgoLabel(photo.memory_year, currentYear)}
              {" · "}
              {formatUploadedDate(photo.taken_at)}
              {" · "}
              {photo.uploader_name}
            </p>
          </div>
        </div>
      </button>
    </article>
  )
}
