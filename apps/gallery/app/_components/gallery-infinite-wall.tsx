"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryWallToolbar } from "@/app/_components/gallery-wall-toolbar"
import { cacheGalleryMediaUrls } from "@/app/_components/gallery-service-worker"
import { fetchGalleryWallPage } from "@/app/actions/wall"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"
import { getGalleryThumbUrl } from "@/lib/gallery/url"
import {
  mergeGalleryWallPage,
  restoreGalleryWallOrder,
  shuffleGalleryWallOrder,
} from "@/lib/gallery/wall-shuffle"

type PrefetchedPage = {
  page: number
  images: GalleryImage[]
  hasMore: boolean
}

function warmThumbUrls(images: GalleryImage[]) {
  const urls: string[] = []
  for (const image of images.slice(0, 48)) {
    const thumbPath =
      image.media_type === "video" && image.poster_path
        ? image.poster_path
        : image.image_path
    urls.push(getGalleryThumbUrl(thumbPath))
  }
  cacheGalleryMediaUrls(urls)
}

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
  const [wallEpoch, setWallEpoch] = useState(0)
  const [shuffled, setShuffled] = useState(false)
  const loadOrderIdsRef = useRef(initialImages.map((image) => image.id))
  const shuffledRef = useRef(false)
  const prefetchingRef = useRef(false)
  const prefetchedRef = useRef<PrefetchedPage | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lightboxOpen = Boolean(openPhotoId)

  useEffect(() => {
    shuffledRef.current = shuffled
  }, [shuffled])

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
    warmThumbUrls(images)
  }, [images])

  const applyPage = useCallback(
    (incoming: GalleryImage[], nextPage: number, nextHasMore: boolean) => {
      const isShuffled = shuffledRef.current
      setImages((prev) => {
        const { images: merged, addedIds } = mergeGalleryWallPage(
          prev,
          incoming,
          isShuffled
        )
        if (addedIds.length > 0) {
          loadOrderIdsRef.current = [...loadOrderIdsRef.current, ...addedIds]
        }
        return merged
      })
      setPage(nextPage)
      setHasMore(nextHasMore)
      if (isShuffled) {
        setWallEpoch((epoch) => epoch + 1)
      }
    },
    []
  )

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    setLoadError(null)
    try {
      const cached =
        prefetchedRef.current?.page === page + 1 ? prefetchedRef.current : null
      prefetchedRef.current = null

      if (cached) {
        applyPage(cached.images, cached.page, cached.hasMore)
        return
      }

      const result = await fetchGalleryWallPage(page + 1, filtersInput)
      if (!result.ok) {
        setLoadError(result.error)
        toast.error(result.error)
        return
      }
      applyPage(result.images, result.page, result.hasMore)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load more photos."
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoadingMore(false)
    }
  }, [applyPage, filtersInput, hasMore, loadingMore, page])

  useEffect(() => {
    if (!hasMore || loadingMore || loadError || prefetchingRef.current) return
    if (prefetchedRef.current?.page === page + 1) return

    let cancelled = false
    prefetchingRef.current = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchGalleryWallPage(page + 1, filtersInput)
          if (cancelled || !result.ok) return
          prefetchedRef.current = {
            page: result.page,
            images: result.images,
            hasMore: result.hasMore,
          }
          warmThumbUrls(result.images)
        } finally {
          prefetchingRef.current = false
        }
      })()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      prefetchingRef.current = false
    }
  }, [filtersInput, hasMore, loadError, loadingMore, page])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loadError) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: "720px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadError, loadMore])

  const onShuffle = useCallback(() => {
    if (images.length < 2) return
    setImages((prev) => shuffleGalleryWallOrder(prev))
    setShuffled(true)
    setWallEpoch((epoch) => epoch + 1)
    toast.success("Wall reshuffled.")
  }, [images.length])

  const onRestoreOrder = useCallback(() => {
    setImages((prev) => restoreGalleryWallOrder(prev, loadOrderIdsRef.current))
    setShuffled(false)
    setWallEpoch((epoch) => epoch + 1)
    toast.success("Wall order restored.")
  }, [])

  return (
    <>
      {images.length > 0 ? (
        <GalleryWallToolbar
          canShuffle={images.length > 1 && !lightboxOpen}
          shuffled={shuffled}
          onShuffle={onShuffle}
          onRestoreOrder={onRestoreOrder}
          lightboxOpen={lightboxOpen}
        />
      ) : null}
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
        filters={filters}
        wallEpoch={wallEpoch}
      />
      {hasMore && !loadError ? (
        <div ref={sentinelRef} className="h-10" aria-hidden />
      ) : null}
      {loadingMore ? (
        <div
          className="mx-auto grid max-w-3xl grid-cols-3 gap-3 py-10 opacity-70"
          aria-hidden
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-[3px] border border-zinc-900/8 bg-zinc-200/70"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : null}
      {loadingMore ? <p className="sr-only">Loading more photos</p> : null}
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
