import Link from "next/link"

import { MemoriesDayNavigator } from "@/app/memories/_components/memories-day-navigator"
import { MemoriesDayView } from "@/app/memories/_components/memories-day-view"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import { GalleryEmptyState } from "@/components/gallery-chrome"
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
  const memoriesResult = await loadGalleryMemoriesOnThisDay(supabase, {
    month: day.month,
    day: day.day,
  })
  const photos = memoriesResult.photos
  const memoriesAvailable = memoriesResult.available
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
        </div>

        {!memoriesAvailable ? (
          <GalleryEmptyState
            title="Not ready yet"
            description="Memories needs the gallery memories migration (capture dates + on-this-day RPC). Apply it, then refresh — Manage already soft-hides capture-date tools until then."
            action={
              <Link
                href="/"
                className="underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
              >
                Back to the wall
              </Link>
            }
          />
        ) : groups.length === 0 ? (
          <GalleryEmptyState
            title="Empty tray"
            description={`Nothing from a past ${label} yet. Shots need a capture date (EXIF or upload day) to land here. Hang a polaroid today, and next year it will show up.`}
            action={
              <p className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
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
            }
          />
        ) : (
          <MemoriesDayView
            groups={groups}
            currentYear={day.year}
            slideshowPhotos={slideshowPhotos}
            slideshowTitle={`Memories · ${label}`}
          />
        )}
      </div>
    </GalleryThemedShell>
  )
}
