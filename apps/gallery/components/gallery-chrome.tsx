import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

export function galleryNavLinkClass(active = false) {
  return cn(
    "inline-flex items-center rounded-full border border-border/50 bg-background/75 px-3 py-1.5",
    "font-[family-name:var(--font-caption)] text-[11px] tracking-wide text-muted-foreground not-italic uppercase",
    "shadow-sm backdrop-blur-md transition-colors",
    "hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground",
    active && "border-foreground/20 bg-muted/40 text-foreground"
  )
}

export function galleryCornerClass() {
  return cn(
    "font-[family-name:var(--font-caption)] text-[11px] tracking-[0.14em] text-muted-foreground/80 uppercase not-italic"
  )
}

export function GalleryCornerTitle({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        galleryCornerClass(),
        "transition-colors hover:text-foreground",
        "inline-flex items-baseline gap-1.5"
      )}
    >
      <span className="font-[family-name:var(--font-serif)] text-sm tracking-normal text-foreground/90 normal-case italic">
        {children}
      </span>
    </Link>
  )
}

export function GallerySiteFooter() {
  return (
    <footer className="mt-14 border-t border-border/40 pt-8 text-center font-[family-name:var(--font-caption)] text-[11px] leading-relaxed text-muted-foreground not-italic sm:mt-16">
      <p className="tracking-wide text-foreground/70 uppercase">
        WinLab Gallery
      </p>
      <p className="mt-2 max-w-md mx-auto opacity-80">
        Tap a polaroid to react or comment. Type @ in a comment to mention a
        labmate.
      </p>
    </footer>
  )
}
