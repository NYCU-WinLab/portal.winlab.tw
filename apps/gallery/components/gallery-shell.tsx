import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { GalleryHeaderSeasonal } from "@/components/gallery-header-seasonal"
import { GalleryHeaderWaterline } from "@/components/gallery-header-waterline"
import { GalleryZongziSeeds } from "@/components/gallery-zongzi-seeds"
import {
  GalleryFooter,
  GalleryNavLink,
  galleryShellBrandClass,
  galleryPageBackdropClass,
  gallerySans,
} from "@/components/gallery-chrome"

export type GalleryShellActive = "home" | "manage"

export function GalleryShell({
  children,
  nav,
  active = "home",
  containerClassName,
}: {
  children: ReactNode
  nav?: ReactNode
  active?: GalleryShellActive
  containerClassName?: string
}) {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className={galleryPageBackdropClass()} aria-hidden />
      <div
        className="gallery-seasonal-decor pointer-events-none fixed inset-0 z-0"
        aria-hidden
      />
      <header className="gallery-shell-header pointer-events-none">
        <div className="gallery-shell-header-inner pointer-events-auto relative mx-auto max-w-6xl px-4 pt-1.5 pb-1 sm:px-6 sm:pb-1.5">
          <div className="gallery-shell-nav-row relative flex min-h-[1.75rem] items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={cn(
                galleryShellBrandClass(active === "home"),
                "relative z-10 inline-flex shrink-0 items-center gap-2"
              )}
            >
              Gallery
              <span
                className={cn(
                  gallerySans(),
                  "gallery-seasonal-badge rounded-full border border-emerald-700/25 bg-emerald-600/10 px-2 py-0.5 text-[10px] tracking-wide text-emerald-800 uppercase not-italic"
                )}
                aria-hidden
              >
                端午
              </span>
            </Link>
            <div className="gallery-header-seasonal-row min-w-0 flex-1">
              <GalleryHeaderSeasonal />
            </div>
            <nav
              className={cn(
                gallerySans(),
                "relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-4"
              )}
            >
              <GalleryNavLink
                href="https://portal.winlab.tw"
                external
                tone="shell"
              >
                Portal
              </GalleryNavLink>
              {nav}
            </nav>
          </div>
        </div>
        <GalleryHeaderWaterline />
      </header>
      <main
        className={cn(
          "gallery-shell-main relative z-10 mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-10 sm:px-6",
          containerClassName
        )}
      >
        {children}
        <div className="mt-14">
          <GalleryFooter />
        </div>
      </main>
      <GalleryZongziSeeds />
    </div>
  )
}
