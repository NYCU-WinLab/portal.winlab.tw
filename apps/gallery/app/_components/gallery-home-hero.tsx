import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"

/** First-viewport brand moment — photo-lab wall, not a timid header tweak. */
export function GalleryHomeHero() {
  return (
    <header className="gallery-home-hero relative mb-8 flex flex-col items-center pt-2 text-center sm:mb-10 sm:pt-4">
      <div
        aria-hidden
        className="gallery-home-hero-rail pointer-events-none absolute inset-x-0 top-[42%] h-px max-w-xl bg-zinc-900/10 sm:max-w-2xl"
      />
      <div className="gallery-home-hero-mark relative mb-4 sm:mb-5">
        <Image
          src="/icons/mark.png"
          alt=""
          width={96}
          height={96}
          className="size-16 object-contain drop-shadow-[0_10px_24px_rgba(24,24,27,0.18)] sm:size-20"
          draggable={false}
          unoptimized
          priority
        />
      </div>
      <h1
        className={cn(
          gallerySerif(),
          "gallery-home-hero-title relative text-5xl leading-none tracking-tight text-foreground sm:text-6xl md:text-7xl"
        )}
      >
        Gallery
      </h1>
      <p
        className={cn(
          gallerySans(),
          "mt-3 max-w-sm text-[11px] tracking-[0.18em] text-muted-foreground uppercase sm:mt-4 sm:text-xs"
        )}
      >
        Lab polaroids on the paper wall
      </p>
    </header>
  )
}
