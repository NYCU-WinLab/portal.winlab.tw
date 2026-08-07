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
    // Committed cool slate paper wall — reads as photo-lab, not flat white
    "bg-[radial-gradient(ellipse_95%_60%_at_50%_-12%,rgba(63,63,70,0.16),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(39,39,42,0.09),transparent_52%),radial-gradient(ellipse_60%_45%_at_0%_95%,rgba(82,82,91,0.08),transparent_48%),linear-gradient(180deg,oklch(0.93_0.01_250)_0%,oklch(0.96_0.008_250)_38%,oklch(0.945_0.01_248)_100%)]"
  )
}

export function galleryNavLinkClass(active = false) {
  return cn(
    gallerySans(),
    "inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-[11px] tracking-wide uppercase",
    "shadow-sm backdrop-blur-md transition-colors",
    active
      ? "border-zinc-800/30 bg-zinc-900/[0.08] text-foreground"
      : "border-border/70 bg-background/80 text-muted-foreground hover:border-foreground/20 hover:bg-muted/55 hover:text-foreground"
  )
}

export function galleryShellBrandClass(active = false) {
  return cn(
    gallerySerif(),
    "text-lg text-foreground/95 transition-colors hover:text-foreground sm:text-xl",
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
    "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground/85 transition-colors",
    "hover:bg-muted/60 hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
  )
}

export function galleryPillClass() {
  return cn(
    gallerySans(),
    "inline-flex min-h-9 items-center rounded-md border border-border/70 bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground md:text-xs"
  )
}

export function galleryPolaroidClass() {
  return cn(
    "gallery-polaroid w-full overflow-visible bg-[#f7f7f5]",
    "rounded-[2px] border-[3px] border-[#f7f7f5]",
    "shadow-[0_2px_4px_rgba(24,24,27,0.08),0_18px_42px_-14px_rgba(24,24,27,0.38),0_0_0_1px_rgba(24,24,27,0.06)]",
    "transition-[box-shadow,transform] duration-500 ease-out",
    "group-hover/polaroid:shadow-[0_4px_10px_rgba(24,24,27,0.1),0_28px_56px_-12px_rgba(24,24,27,0.42),0_0_0_1px_rgba(24,24,27,0.08)]"
  )
}

export function gallerySectionTitleClass() {
  return cn(
    gallerySerif(),
    "text-4xl leading-none tracking-tight text-foreground sm:text-5xl"
  )
}

export function gallerySectionLeadClass() {
  return cn(
    gallerySans(),
    "text-sm leading-relaxed text-muted-foreground sm:text-base"
  )
}

export function galleryPanelClass() {
  return cn(
    "gallery-panel rounded-xl border border-zinc-900/12 bg-card/80 p-5 shadow-[0_1px_2px_rgba(24,24,27,0.06),0_16px_40px_-24px_rgba(24,24,27,0.28)] backdrop-blur-sm sm:p-7"
  )
}

export function GalleryBrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/mark.png"
      alt=""
      width={32}
      height={32}
      className={cn(
        "gallery-brand-mark size-7 shrink-0 object-contain sm:size-8",
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
        width={32}
        height={32}
        className="size-8 opacity-75"
        draggable={false}
        unoptimized
      />
      <p
        className={cn(
          gallerySans(),
          "w-full text-center text-[11px] text-muted-foreground"
        )}
      >
        <span className={cn(gallerySerif(), "text-base text-foreground/85")}>
          Gallery
        </span>
        <span aria-hidden className="mx-1.5">
          ·
        </span>
        <span>© {year} NYCU WinLab</span>
        <span aria-hidden className="mx-1.5">
          ·
        </span>
        <span>paper wall</span>
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
        className="gallery-empty-polaroid mb-6 flex h-[5.5rem] w-16 rotate-[-7deg] items-center justify-center rounded-[2px] border-[3px] border-[#f7f7f5] bg-[#f7f7f5] shadow-[0_12px_28px_-10px_rgba(24,24,27,0.4)]"
      >
        <Image
          src="/icons/mark.png"
          alt=""
          width={40}
          height={40}
          className="size-10 object-contain opacity-90"
          draggable={false}
          unoptimized
        />
      </div>
      <p className={gallerySectionTitleClass()}>{title}</p>
      {description ? (
        <p className={cn(gallerySectionLeadClass(), "mt-3 max-w-xs")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
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
