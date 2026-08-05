import Image from "next/image"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"

/** Shared page-title treatment so Manage / Upload match the home renewal. */
export function GalleryPageHero({
  title,
  lead,
  showMark = true,
}: {
  title: string
  lead: ReactNode
  showMark?: boolean
}) {
  return (
    <header className="gallery-page-hero relative mb-2 space-y-3 sm:space-y-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1 left-0 h-px w-24 bg-zinc-900/15 sm:w-32"
      />
      {showMark ? (
        <Image
          src="/icons/mark.png"
          alt=""
          width={56}
          height={56}
          className="gallery-home-hero-mark size-10 object-contain opacity-90 sm:size-12"
          draggable={false}
          unoptimized
        />
      ) : null}
      <h1
        className={cn(
          gallerySerif(),
          "gallery-home-hero-title text-4xl leading-none tracking-tight text-foreground sm:text-5xl md:text-6xl"
        )}
      >
        {title}
      </h1>
      <p
        className={cn(
          gallerySans(),
          "max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base"
        )}
      >
        {lead}
      </p>
    </header>
  )
}
