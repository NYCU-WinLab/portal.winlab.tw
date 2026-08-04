import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

export function gallerySans() {
  return "font-[family-name:var(--font-caption)] not-italic"
}

export function gallerySerif() {
  return "font-[family-name:var(--font-serif)] italic"
}

export function galleryPageBackdropClass() {
  return cn(
    "gallery-page-backdrop pointer-events-none fixed inset-0 -z-10",
    // Cool zinc wash + faint vignette — paper-wall, not cream/terracotta
    "bg-[radial-gradient(ellipse_85%_55%_at_50%_-8%,rgba(82,82,91,0.09),transparent_58%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(24,24,27,0.04),transparent_50%)]",
    "dark:bg-[radial-gradient(ellipse_85%_55%_at_50%_-8%,rgba(255,255,255,0.05),transparent_58%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(255,255,255,0.03),transparent_50%)]"
  )
}

export function galleryNavLinkClass(active = false) {
  return cn(
    gallerySans(),
    "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] tracking-wide uppercase",
    "shadow-sm backdrop-blur-md transition-colors",
    active
      ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
      : "border-border/60 bg-background/80 text-muted-foreground hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground"
  )
}

export function galleryShellBrandClass(active = false) {
  return cn(
    gallerySerif(),
    "text-sm text-foreground/85 transition-colors hover:text-foreground",
    active && "text-foreground"
  )
}

export function galleryShellNavLinkClass(active = false) {
  return cn(
    gallerySans(),
    "inline-flex items-center px-1 py-0.5 text-[11px] tracking-wide uppercase transition-colors",
    active
      ? "text-foreground"
      : "text-muted-foreground/85 hover:text-foreground"
  )
}

export function galleryShellIconButtonClass() {
  return cn(
    gallerySans(),
    "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/85 transition-colors",
    "hover:bg-muted/60 hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
  )
}

export function galleryPillClass() {
  return cn(
    gallerySans(),
    "inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground md:text-xs"
  )
}

export function galleryPolaroidClass() {
  return cn(
    "gallery-polaroid w-full overflow-hidden bg-white",
    "rounded-[3px] border border-black/[0.08]",
    "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_-16px_rgba(24,24,27,0.28)]",
    "transition-[box-shadow,transform] duration-500 ease-out",
    "group-hover/polaroid:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_20px_44px_-14px_rgba(24,24,27,0.32)]"
  )
}

export function gallerySectionTitleClass() {
  return cn(gallerySerif(), "text-3xl text-foreground/90 sm:text-4xl")
}

export function gallerySectionLeadClass() {
  return cn(
    gallerySans(),
    "text-sm leading-relaxed text-muted-foreground sm:text-base"
  )
}

export function galleryPanelClass() {
  return cn(
    "gallery-panel rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-sm sm:p-6"
  )
}

export function GalleryFooter() {
  const year = new Date().getFullYear()

  return (
    <p
      className={cn(
        gallerySans(),
        "gallery-footer w-full text-center text-[11px] text-muted-foreground"
      )}
    >
      <span className={cn(gallerySerif(), "text-foreground/80")}>Gallery</span>
      <span aria-hidden className="mx-1.5">
        ·
      </span>
      <span>© {year} NYCU WinLab</span>
    </p>
  )
}

export function GalleryEmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        galleryPanelClass(),
        "mx-auto flex max-w-md flex-col items-center py-14 text-center"
      )}
    >
      <div
        aria-hidden
        className="mb-5 flex h-16 w-14 rotate-[-4deg] items-center justify-center rounded-[2px] border border-black/[0.08] bg-white shadow-md"
      >
        <div className="h-10 w-8 rounded-sm bg-muted" />
      </div>
      <p className={gallerySectionTitleClass()}>{title}</p>
      {description ? (
        <p className={cn(gallerySectionLeadClass(), "mt-2 max-w-xs")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function GalleryNavLink({
  href,
  active,
  children,
  external,
  tone = "pill",
}: {
  href: string
  active?: boolean
  children: ReactNode
  external?: boolean
  tone?: "pill" | "shell"
}) {
  const className =
    tone === "shell"
      ? galleryShellNavLinkClass(active)
      : galleryNavLinkClass(active)
  if (external) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
