"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { cacheGalleryMediaUrls } from "@/app/_components/gallery-service-worker"
import { fetchGalleryWallPage } from "@/app/actions/wall"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const filtersInput = useMemo(
    () => ({
      uploader: filters.uploaderId ?? undefined,
      media: filters.media !== "all" ? filters.media : undefined,
      after: filters.uploadedAfter ?? undefined,
      q: filters.query ?? undefined,
    }),
    [filters]
  )

  useEffect(() => {
    const urls: string[] = []
    for (const image of images) {
      const thumbPath =
        image.media_type === "video" && image.poster_path
          ? image.poster_path
          : image.image_path
      urls.push(getGalleryThumbUrl(thumbPath), getGalleryImageUrl(thumbPath))
      for (const item of image.sequence_items) {
        const itemPath =
          item.media_type === "video" && item.poster_path
            ? item.poster_path
            : item.image_path
        urls.push(getGalleryThumbUrl(itemPath), getGalleryImageUrl(itemPath))
      }
    }
    cacheGalleryMediaUrls(urls)
  }, [images])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    setLoadError(null)
    try {
      const result = await fetchGalleryWallPage(page + 1, filtersInput)
      if (!result.ok) {
        setLoadError(result.error)
        toast.error(result.error)
        return
      }
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load more photos."
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoadingMore(false)
    }
  }, [filtersInput, hasMore, loadingMore, page])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loadError) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: "480px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadError, loadMore])

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
      {hasMore && !loadError ? (
        <div ref={sentinelRef} className="h-10" aria-hidden />
      ) : null}
      {loadingMore ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Loading more…
        </p>
      ) : null}
      {loadError ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-center text-xs text-muted-foreground">
            Couldn&apos;t load more photos.
          </p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-xs underline underline-offset-4"
          >
            Retry
          </button>
        </div>
      ) : null}
    </>
  )
}
