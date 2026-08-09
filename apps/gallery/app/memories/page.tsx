import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { MemoriesYearSections } from "@/app/memories/_components/memories-year-sections"
import { GalleryPageHero } from "@/app/_components/gallery-page-hero"
import { galleryPanelClass, gallerySans } from "@/components/gallery-chrome"
import { GalleryThemedShell } from "@/components/gallery-shell"
import { loadGalleryMemoriesOnThisDay } from "@/lib/gallery/load-memories"
import {
  formatMemoriesDayLabel,
  groupMemoriesByYear,
  resolveMemoriesCalendarDay,
} from "@/lib/gallery/memories"
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

  const supabase = await createClient()
  const user = await getCurrentUser()
  const photos = await loadGalleryMemoriesOnThisDay(supabase, {
    month: day.month,
    day: day.day,
  })
  const groups = groupMemoriesByYear(photos)

  return (
    <GalleryThemedShell
      active="memories"
      signedIn={Boolean(user)}
      containerClassName="max-w-5xl"
    >
      <div className="flex flex-col gap-10 sm:gap-12">
        <GalleryPageHero
          title="Memories"
          lead={
            <>
              On this day — {label}. Prior-year shots from the lab paper wall,
              matched by capture time when the camera wrote it down.
            </>
          }
        />

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
              Nothing from a past {label} yet. Hang a polaroid today, and next
              year it will show up here.
            </p>
            <p className={cn(gallerySans(), "text-sm")}>
              <Link
                href="/"
                className="underline decoration-zinc-400/80 underline-offset-4 hover:decoration-zinc-700"
              >
                Back to the wall
              </Link>
            </p>
          </section>
        ) : (
          <MemoriesYearSections groups={groups} currentYear={day.year} />
        )}
      </div>
    </GalleryThemedShell>
  )
}
