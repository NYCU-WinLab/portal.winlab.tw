import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { GalleryFootballSeeds } from "@/components/gallery-football-seeds"
import { GalleryHeaderPitchline } from "@/components/gallery-header-pitchline"
import { GalleryHeaderSeasonal } from "@/components/gallery-header-seasonal"
import { GalleryHeaderWaterline } from "@/components/gallery-header-waterline"
import { GalleryZongziSeeds } from "@/components/gallery-zongzi-seeds"
import { GalleryJumpToTop } from "@/app/_components/gallery-jump-to-top"
import { GalleryPaperParallax } from "@/app/_components/gallery-paper-parallax"
import {
  GalleryBrandMark,
  GalleryFooter,
  galleryShellBrandClass,
  galleryPageBackdropClass,
  gallerySans,
} from "@/components/gallery-chrome"
import {
  GalleryShellNav,
  type GalleryShellActive,
} from "@/components/gallery-shell-nav"
import { isGalleryAlbumsReady } from "@/lib/gallery/albums"
import { isGalleryMemoriesReady } from "@/lib/gallery/load-memories"
import {
  isGalleryNotificationsReady,
  loadUnreadGalleryNotifications,
  type GalleryNotification,
} from "@/lib/gallery/notifications"
import {
  GALLERY_SEASONAL_THEMES,
  type GallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"
import { getGallerySeasonalThemeId } from "@/lib/gallery/settings"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

export type { GalleryShellActive } from "@/components/gallery-shell-nav"

export function GalleryShell({
  children,
  active = "home",
  signedIn = false,
  viewerId = null,
  seasonalThemeId = null,
  mentionNotifications = [],
  albumsAvailable = true,
  memoriesAvailable = true,
  notificationsAvailable = true,
  containerClassName,
}: {
  children: ReactNode
  active?: GalleryShellActive
  signedIn?: boolean
  viewerId?: string | null
  seasonalThemeId?: GallerySeasonalThemeId | null
  mentionNotifications?: GalleryNotification[]
  albumsAvailable?: boolean
  memoriesAvailable?: boolean
  notificationsAvailable?: boolean
  containerClassName?: string
}) {
  const theme = seasonalThemeId
    ? GALLERY_SEASONAL_THEMES[seasonalThemeId]
    : null

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className={galleryPageBackdropClass()} aria-hidden />
      <div
        className="gallery-seasonal-decor pointer-events-none fixed inset-0 z-0"
        aria-hidden
      />
      <GalleryPaperParallax />
      <header className="gallery-shell-header pointer-events-none">
        <div className="gallery-shell-header-inner pointer-events-auto relative mx-auto max-w-6xl px-4 pt-2.5 pb-2 sm:px-6 sm:pb-2.5">
          <div className="gallery-shell-nav-row relative grid min-h-[2rem] w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={cn(
                galleryShellBrandClass(active === "home"),
                "relative z-10 inline-flex min-w-0 items-center gap-2 sm:gap-2.5"
              )}
            >
              <GalleryBrandMark />
              <span className="truncate">Gallery</span>
              {theme ? (
                <span
                  className={cn(
                    gallerySans(),
                    "gallery-seasonal-badge shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] tracking-wide uppercase not-italic sm:px-2 sm:text-[10px]",
                    seasonalThemeId === "dragon-boat" &&
                      "border-emerald-700/25 bg-emerald-600/10 text-emerald-800",
                    seasonalThemeId === "world-cup" &&
                      "border-lime-800/25 bg-lime-600/12 text-lime-950"
                  )}
                  aria-hidden
                >
                  {theme.badge}
                </span>
              ) : null}
            </Link>
            <div className="gallery-header-seasonal-row relative z-0 hidden min-w-0 items-end justify-center justify-self-stretch overflow-hidden sm:flex">
              <GalleryHeaderSeasonal themeId={seasonalThemeId} />
            </div>
            <div className="relative z-10 justify-self-end">
              <GalleryShellNav
                active={active}
                signedIn={signedIn}
                viewerId={viewerId}
                mentionNotifications={mentionNotifications}
                albumsAvailable={albumsAvailable}
                memoriesAvailable={memoriesAvailable}
                notificationsAvailable={notificationsAvailable}
              />
            </div>
          </div>
        </div>
        {seasonalThemeId === "dragon-boat" ? <GalleryHeaderWaterline /> : null}
        {seasonalThemeId === "world-cup" ? <GalleryHeaderPitchline /> : null}
      </header>
      <main
        id="gallery-main"
        tabIndex={-1}
        className={cn(
          "gallery-shell-main relative z-10 mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-10 sm:px-6",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          containerClassName
        )}
      >
        {children}
        <div className="mt-14">
          <GalleryFooter />
        </div>
      </main>
      {seasonalThemeId === "dragon-boat" ? <GalleryZongziSeeds /> : null}
      {seasonalThemeId === "world-cup" ? <GalleryFootballSeeds /> : null}
      <GalleryJumpToTop />
    </div>
  )
}

export async function GalleryThemedShell({
  children,
  active = "home",
  signedIn = false,
  containerClassName,
}: {
  children: ReactNode
  active?: GalleryShellActive
  signedIn?: boolean
  containerClassName?: string
}) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  const [
    seasonalThemeId,
    mentionNotifications,
    albumsAvailable,
    memoriesAvailable,
    notificationsAvailable,
  ] = await Promise.all([
    getGallerySeasonalThemeId(supabase),
    user
      ? loadUnreadGalleryNotifications(supabase, user.id)
      : Promise.resolve([]),
    isGalleryAlbumsReady(supabase),
    isGalleryMemoriesReady(supabase),
    isGalleryNotificationsReady(supabase),
  ])

  return (
    <GalleryShell
      active={active}
      signedIn={Boolean(user)}
      viewerId={user?.id ?? null}
      seasonalThemeId={seasonalThemeId}
      mentionNotifications={notificationsAvailable ? mentionNotifications : []}
      albumsAvailable={albumsAvailable}
      memoriesAvailable={memoriesAvailable}
      notificationsAvailable={notificationsAvailable}
      containerClassName={containerClassName}
    >
      {children}
    </GalleryShell>
  )
}
