import type { ReactNode } from "react"
import Image from "next/image"
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
    // Cool zinc wash + soft corner vignette — darkroom paper wall (light only)
    "bg-[radial-gradient(ellipse_85%_55%_at_50%_-8%,rgba(82,82,91,0.1),transparent_58%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(24,24,27,0.045),transparent_50%),radial-gradient(ellipse_55%_40%_at_0%_100%,rgba(63,63,70,0.04),transparent_48%)]"
  )
}

export function galleryNavLinkClass(active = false) {
  return cn(
    gallerySans(),
    "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-[11px] tracking-wide uppercase",
    "shadow-sm backdrop-blur-md transition-colors",
    active
      ? "border-zinc-700/25 bg-zinc-900/[0.06] text-foreground"
      : "border-border/60 bg-background/85 text-muted-foreground hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground"
  )
}

export function galleryShellBrandClass(active = false) {
  return cn(
    gallerySerif(),
    "text-base text-foreground/90 transition-colors hover:text-foreground sm:text-lg",
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
    "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/85 transition-colors",
    "hover:bg-muted/60 hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
  )
}

export function galleryPillClass() {
  return cn(
    gallerySans(),
    "inline-flex min-h-9 items-center rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground md:text-xs"
  )
}

export function galleryPolaroidClass() {
  return cn(
    "gallery-polaroid w-full overflow-hidden bg-[#fafafa]",
    "rounded-[3px] border border-zinc-900/[0.08]",
    "shadow-[0_1px_2px_rgba(24,24,27,0.06),0_14px_36px_-16px_rgba(24,24,27,0.3)]",
    "transition-[box-shadow,transform] duration-500 ease-out",
    "group-hover/polaroid:shadow-[0_3px_8px_rgba(24,24,27,0.08),0_22px_48px_-14px_rgba(24,24,27,0.34)]"
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
    "gallery-panel rounded-2xl border border-zinc-900/10 bg-card/70 p-5 shadow-sm backdrop-blur-sm sm:p-6"
  )
}

export function GalleryBrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/mark.png"
      alt=""
      width={28}
      height={28}
      className={cn(
        "gallery-brand-mark size-6 shrink-0 object-contain sm:size-7",
        className
      )}
      draggable={false}
      unoptimized
      priority
    />
  )
}

export function GalleryFooter() {
  const year = new Date().getFullYear()

  return (
    <div className="gallery-footer flex flex-col items-center gap-3">
      <Image
        src="/icons/mark.png"
        alt=""
        width={28}
        height={28}
        className="size-7 opacity-70"
        draggable={false}
        unoptimized
      />
      <p
        className={cn(
          gallerySans(),
          "w-full text-center text-[11px] text-muted-foreground"
        )}
      >
        <span className={cn(gallerySerif(), "text-foreground/80")}>
          Gallery
        </span>
        <span aria-hidden className="mx-1.5">
          ·
        </span>
        <span>© {year} NYCU WinLab</span>
        <span aria-hidden className="mx-1.5">
          ·
        </span>
        <span>darkroom paper wall</span>
      </p>
    </div>
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
        "gallery-empty-state mx-auto flex max-w-md flex-col items-center py-14 text-center"
      )}
    >
      <div
        aria-hidden
        className="gallery-empty-polaroid mb-6 flex h-[4.75rem] w-14 rotate-[-5deg] items-center justify-center rounded-[3px] border border-zinc-900/[0.1] bg-[#fafafa] shadow-[0_8px_24px_-12px_rgba(24,24,27,0.35)]"
      >
        <Image
          src="/icons/mark.png"
          alt=""
          width={36}
          height={36}
          className="size-9 object-contain opacity-90"
          draggable={false}
          unoptimized
        />
      </div>
      <p className={gallerySectionTitleClass()}>{title}</p>
      {description ? (
        <p className={cn(gallerySectionLeadClass(), "mt-2 max-w-xs")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
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
