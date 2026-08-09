"use client"

import { cn } from "@workspace/ui/lib/utils"

import { AlbumSlideshowButton } from "@/app/albums/_components/album-slideshow"
import { MemoriesPhotoCard } from "@/app/memories/_components/memories-photo-card"
import {
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import {
  memoriesYearsAgoLabel,
  type GalleryMemoryYearGroup,
} from "@/lib/gallery/memories"
import type { GallerySlideshowPhoto } from "@/lib/gallery/slideshow"

export function MemoriesYearSections({
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
  if (groups.length === 0) return null

  let offset = 0

  return (
    <div className="flex flex-col gap-12 sm:gap-14">
      {groups.map((group) => {
        const startIndex = offset
        offset += group.photos.length

        return (
          <section key={group.year} className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <p
                  className={cn(
                    gallerySans(),
                    "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
                  )}
                >
                  {memoriesYearsAgoLabel(group.year, currentYear)}
                </p>
                <h2
                  className={cn(
                    gallerySectionTitleClass(),
                    "text-2xl sm:text-3xl"
                  )}
                >
                  {group.year}
                </h2>
                <p className={gallerySectionLeadClass()}>
                  {group.photos.length === 1
                    ? "One polaroid from this day."
                    : `${group.photos.length} polaroids from this day.`}
                </p>
              </div>
              {slideshowPhotos.length > 0 ? (
                <AlbumSlideshowButton
                  photos={slideshowPhotos}
                  albumTitle={slideshowTitle}
                  startIndex={startIndex}
                  triggerLabel={`Slideshow ${group.year}`}
                  className={cn(
                    gallerySans(),
                    "inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-[11px] tracking-wide uppercase shadow-xs",
                    "hover:bg-accent hover:text-accent-foreground"
                  )}
                />
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-3">
              {group.photos.map((photo) => (
                <MemoriesPhotoCard
                  key={photo.id}
                  photo={photo}
                  currentYear={currentYear}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
