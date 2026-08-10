"use client"

import { useTransition, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { buildGalleryHomeHref } from "@/lib/gallery/home-filters"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"

export function UploaderFilterLink({
  uploaderId,
  className,
  children,
}: {
  uploaderId: string
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const applyFilter = () => {
    if (pending) return
    const href = buildGalleryHomeHref({
      filters: {
        uploaderId,
        media: "all",
        uploadedAfter: null,
        query: searchParams.get("q"),
        tagSlug: searchParams.get("tag"),
        savedOnly: searchParams.get("saved") === "1",
        albumSlug: searchParams.get("album"),
      },
      photoId: searchParams.get("photo"),
      commentId: searchParams.get("comment"),
    })
    startTransition(() => {
      try {
        router.push(href)
      } catch {
        toast.error(describeGalleryNavError("applyUploaderFilter"))
      }
    })
  }

  return (
    <span
      role="link"
      tabIndex={pending ? -1 : 0}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        event.stopPropagation()
        applyFilter()
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        event.stopPropagation()
        applyFilter()
      }}
      className={cn(
        gallerySans(),
        "cursor-pointer rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline",
        pending && "pointer-events-none opacity-60",
        className
      )}
    >
      {children}
    </span>
  )
}
