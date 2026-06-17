import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

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
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <div
          className={cn(
            "pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6",
            "bg-gradient-to-b from-background/45 via-background/15 to-transparent"
          )}
        >
          <Link href="/" className={galleryShellBrandClass(active === "home")}>
            Gallery
          </Link>
          <nav
            className={cn(
              gallerySans(),
              "flex flex-wrap items-center justify-end gap-3 sm:gap-4"
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
      </header>
      <main
        className={cn(
          "relative mx-auto w-full max-w-6xl overflow-x-clip px-4 pt-12 pb-10 sm:px-6",
          containerClassName
        )}
      >
        {children}
        <div className="mt-14">
          <GalleryFooter />
        </div>
      </main>
    </div>
  )
}
