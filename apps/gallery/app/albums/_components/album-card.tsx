"use client"

import Link from "next/link"
import { useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { ShareAlbumButton } from "@/app/_components/share-album-button"
import {
  galleryPolaroidClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import type { GalleryAlbumSummary } from "@/lib/gallery/albums"
import { describeCopyShareLinkLabel } from "@/lib/gallery/album-share-toast"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

function coverSrc(album: GalleryAlbumSummary): string | null {
  if (!album.cover_image_path) return null
  if (album.cover_media_type === "video" && album.cover_poster_path) {
    return getGalleryThumbUrl(album.cover_poster_path)
  }
  return getGalleryThumbUrl(album.cover_image_path)
}

function AlbumCoverThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-neutral-200/80 to-neutral-300/70 px-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/mark.png"
          alt=""
          width={36}
          height={36}
          className="size-8 object-contain opacity-40 grayscale"
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
      src={src}
      alt=""
      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/polaroid:scale-[1.03]"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export function GalleryAlbumCard({
  album,
  showShare = false,
}: {
  album: GalleryAlbumSummary
  showShare?: boolean
}) {
  const src = coverSrc(album)

  return (
    <div className="group/polaroid relative">
      <Link
        href={`/albums/${album.slug}`}
        className="block focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <figure className={cn(galleryPolaroidClass(), "p-3 pb-4")}>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1px] bg-zinc-200/80">
            {src ? (
              <AlbumCoverThumb src={src} />
            ) : (
              <div
                className={cn(
                  gallerySans(),
                  "flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500"
                )}
              >
                Empty album
              </div>
            )}
          </div>
          <figcaption className="mt-3 space-y-1 px-0.5">
            <p
              className={cn(
                gallerySerif(),
                "truncate text-lg leading-tight text-foreground"
              )}
            >
              {album.title}
            </p>
            <p
              className={cn(gallerySans(), "text-[11px] text-muted-foreground")}
            >
              {album.photo_count} photo{album.photo_count === 1 ? "" : "s"}
              <span aria-hidden> · </span>
              {album.owner_name}
            </p>
          </figcaption>
        </figure>
      </Link>
      {showShare ? (
        <div
          className="absolute top-5 right-5 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within/polaroid:opacity-100 sm:group-hover/polaroid:opacity-100"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ShareAlbumButton
            slug={album.slug}
            title={album.title}
            variant="icon"
            label={describeCopyShareLinkLabel()}
            className="h-8 w-8 bg-white/90 shadow-md"
          />
        </div>
      ) : null}
    </div>
  )
}
