import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

function buildPageHref(page: number) {
  if (page <= 1) return "/"
  return `/?page=${page}`
}

export function GalleryPagination({
  page,
  totalPages,
}: {
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null

  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  const visible = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <nav
      aria-label="Gallery pages"
      className="mt-10 flex items-center justify-center gap-2 font-[family-name:var(--font-caption)] not-italic sm:mt-12"
    >
      <Link
        href={buildPageHref(page - 1)}
        className={cn(
          "rounded-full border px-3 py-1 text-sm transition-colors",
          page <= 1
            ? "pointer-events-none opacity-40"
            : "hover:bg-foreground/10"
        )}
      >
        Prev
      </Link>
      {visible.map((p) => (
        <Link
          key={p}
          href={buildPageHref(p)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            p === page
              ? "border-foreground bg-foreground/10 text-foreground"
              : "hover:bg-foreground/10"
          )}
        >
          {p}
        </Link>
      ))}
      <Link
        href={buildPageHref(page + 1)}
        className={cn(
          "rounded-full border px-3 py-1 text-sm transition-colors",
          page >= totalPages
            ? "pointer-events-none opacity-40"
            : "hover:bg-foreground/10"
        )}
      >
        Next
      </Link>
    </nav>
  )
}
