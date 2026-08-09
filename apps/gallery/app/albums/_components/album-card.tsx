import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import {
  galleryPolaroidClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import type { GalleryAlbumSummary } from "@/lib/gallery/albums"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

function coverSrc(album: GalleryAlbumSummary): string | null {
  if (!album.cover_image_path) return null
  if (album.cover_media_type === "video" && album.cover_poster_path) {
    return getGalleryThumbUrl(album.cover_poster_path)
  }
  return getGalleryThumbUrl(album.cover_image_path)
}

export function GalleryAlbumCard({ album }: { album: GalleryAlbumSummary }) {
  const src = coverSrc(album)

  return (
    <Link
      href={`/albums/${album.slug}`}
      className="group/polaroid block focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <figure className={cn(galleryPolaroidClass(), "p-3 pb-4")}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1px] bg-zinc-200/80">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/polaroid:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
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
          <p className={cn(gallerySans(), "text-[11px] text-muted-foreground")}>
            {album.photo_count} photo{album.photo_count === 1 ? "" : "s"}
            <span aria-hidden> · </span>
            {album.owner_name}
          </p>
        </figcaption>
      </figure>
    </Link>
  )
}
