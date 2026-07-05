"use client"

import type { ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans } from "@/components/gallery-chrome"
import { buildGalleryHomeHref } from "@/lib/gallery/home-filters"

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

  const applyFilter = () => {
    const href = buildGalleryHomeHref({
      filters: {
        uploaderId,
        media: "all",
        uploadedAfter: null,
        query: searchParams.get("q"),
      },
      photoId: searchParams.get("photo"),
      commentId: searchParams.get("comment"),
    })
    router.push(href)
  }

  return (
    <span
      role="link"
      tabIndex={0}
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
        className
      )}
    >
      {children}
    </span>
  )
}
