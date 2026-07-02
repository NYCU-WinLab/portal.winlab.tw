import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { galleryNavLinkClass, gallerySans } from "@/components/gallery-chrome"
import {
  buildGalleryHomeHref,
  type GalleryHomeFilters,
} from "@/lib/gallery/home-filters"

function buildPageHref(page: number, filters?: GalleryHomeFilters) {
  return buildGalleryHomeHref({ page, filters })
}

export function GalleryPagination({
  page,
  totalPages,
  filters,
}: {
  page: number
  totalPages: number
  filters?: GalleryHomeFilters
}) {
  if (totalPages <= 1) return null

  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  const visible = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <nav
      aria-label="Gallery pages"
      className={cn(
        gallerySans(),
        "gallery-pagination mt-12 flex items-center justify-center gap-2 sm:mt-14"
      )}
    >
      <Link
        href={buildPageHref(page - 1, filters)}
        className={cn(
          galleryNavLinkClass(),
          page <= 1 && "pointer-events-none opacity-40"
        )}
        aria-disabled={page <= 1}
      >
        Prev
      </Link>
      {visible.map((p) => (
        <Link
          key={p}
          href={buildPageHref(p, filters)}
          className={galleryNavLinkClass(p === page)}
          aria-current={p === page ? "page" : undefined}
        >
          {p}
        </Link>
      ))}
      <Link
        href={buildPageHref(page + 1, filters)}
        className={cn(
          galleryNavLinkClass(),
          page >= totalPages && "pointer-events-none opacity-40"
        )}
        aria-disabled={page >= totalPages}
      >
        Next
      </Link>
    </nav>
  )
}
