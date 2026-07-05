"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { fetchGalleryWallPage } from "@/app/actions/wall"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export function GalleryInfiniteWall({
  initialImages,
  initialPage,
  initialHasMore,
  filters,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  isAdmin,
  openPhotoId = null,
  openCommentId = null,
}: {
  initialImages: GalleryImage[]
  initialPage: number
  initialHasMore: boolean
  filters: GalleryHomeFilters
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin: boolean
  openPhotoId?: string | null
  openCommentId?: string | null
}) {
  const [images, setImages] = useState(initialImages)
  const [page, setPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setImages(initialImages)
    setPage(initialPage)
    setHasMore(initialHasMore)
  }, [initialImages, initialPage, initialHasMore])

  const filtersInput = useMemo(
    () => ({
      uploader: filters.uploaderId ?? undefined,
      media: filters.media !== "all" ? filters.media : undefined,
      after: filters.uploadedAfter ?? undefined,
      q: filters.query ?? undefined,
    }),
    [filters]
  )

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await fetchGalleryWallPage(page + 1, filtersInput)
      if (!result.ok) return
      setImages((prev) => {
        const seen = new Set(prev.map((image) => image.id))
        const next = [...prev]
        for (const image of result.images) {
          if (seen.has(image.id)) continue
          seen.add(image.id)
          next.push(image)
        }
        return next
      })
      setPage(result.page)
      setHasMore(result.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }, [filtersInput, hasMore, loadingMore, page])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: "480px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  return (
    <>
      <GalleryGrid
        images={images}
        isSignedIn={isSignedIn}
        viewerId={viewerId}
        viewerName={viewerName}
        members={members}
        isAdmin={isAdmin}
        openPhotoId={openPhotoId}
        openCommentId={openCommentId}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
      {hasMore ? <div ref={sentinelRef} className="h-10" aria-hidden /> : null}
      {loadingMore ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Loading more…
        </p>
      ) : null}
    </>
  )
}
