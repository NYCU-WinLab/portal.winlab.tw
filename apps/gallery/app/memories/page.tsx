import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { AlbumSlideshowButton } from "@/app/albums/_components/album-slideshow"
import { MemoriesDayNavigator } from "@/app/memories/_components/memories-day-navigator"
import { MemoriesYearSections } from "@/app/memories/_components/memories-year-sections"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import { galleryPanelClass, gallerySans } from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryMemoriesOnThisDay } from "@/lib/gallery/load-memories"
import {
  formatMemoriesDayLabel,
  groupMemoriesByYear,
  isMemoriesViewingToday,
  resolveMemoriesCalendarDay,
} from "@/lib/gallery/memories"
import { flattenMemoryGroupsForSlideshow } from "@/lib/gallery/slideshow"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export const dynamic = "force-dynamic"

type MemoriesPageProps = {
  searchParams: Promise<{
    month?: string
    day?: string
  }>
}

export default async function MemoriesPage({
  searchParams,
}: MemoriesPageProps) {
  const params = await searchParams
  const day = resolveMemoriesCalendarDay({
    month: params.month,
    day: params.day,
  })
  const label = formatMemoriesDayLabel(day.month, day.day)
  const viewingToday = isMemoriesViewingToday(day)

  const supabase = await createClient()
  const user = await getCurrentUser()
  const photos = await loadGalleryMemoriesOnThisDay(supabase, {
    month: day.month,
    day: day.day,
  })
  const groups = groupMemoriesByYear(photos)
  const slideshowPhotos = flattenMemoryGroupsForSlideshow(groups)

  return (
    <GalleryThemedShell
      active="memories"
      signedIn={Boolean(user)}
      containerClassName="max-w-5xl"
    >
      <div className="flex flex-col gap-10 sm:gap-12">
        <div className="space-y-5">
          <GalleryPageHero
            title="Memories"
            lead={
              <>
                {viewingToday ? "On this day" : "Looking back"} — {label}.
                Prior-year shots from the lab paper wall, matched by capture
                time when the camera wrote it down.
              </>
            }
          />
          <MemoriesDayNavigator day={day} />
          {slideshowPhotos.length > 0 ? (
            <AlbumSlideshowButton
              photos={slideshowPhotos}
              albumTitle={`Memories · ${label}`}
              triggerLabel="Slideshow"
              className={cn(
                gallerySans(),
                "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
                "hover:bg-accent hover:text-accent-foreground"
              )}
            />
          ) : null}
        </div>

        {groups.length === 0 ? (
          <section className={cn(galleryPanelClass(), "space-y-3")}>
            <p
              className={cn(
                gallerySans(),
                "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
              )}
            >
              Empty tray
            </p>
            <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
              Nothing from a past {label} yet. Shots need a capture date (EXIF
              or upload day) to land here. Hang a polaroid today, and next year
              it will show up.
            </p>
            <p
              className={cn(
                gallerySans(),
                "flex flex-wrap gap-x-4 gap-y-2 text-sm"
              )}
            >
              <Link
                href="/"
                className="underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
              >
                Back to the wall
              </Link>
              {user ? (
                <Link
                  href="/upload"
                  className="underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
                >
                  Upload a polaroid
                </Link>
              ) : null}
            </p>
          </section>
        ) : (
          <MemoriesYearSections groups={groups} currentYear={day.year} />
        )}
      </div>
    </GalleryThemedShell>
  )
}
