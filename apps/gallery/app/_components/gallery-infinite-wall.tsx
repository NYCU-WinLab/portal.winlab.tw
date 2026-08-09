"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { GalleryGrid } from "@/app/_components/gallery-grid"
import { GalleryWallSelectBar } from "@/app/_components/gallery-wall-select-bar"
import { GalleryWallToolbar } from "@/app/_components/gallery-wall-toolbar"
import { cacheGalleryMediaUrls } from "@/app/_components/gallery-service-worker"
import { fetchGalleryWallPage } from "@/app/actions/wall"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import {
  applyArtworkRenamePatches,
  type ArtworkNamePatch,
} from "@/lib/gallery/rename-artwork"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"
import { getGalleryThumbUrl } from "@/lib/gallery/url"
import {
  orderedSelectedWallIds,
  selectWallIdRange,
  toggleSelectAllWallIds,
  toggleWallSelection,
} from "@/lib/gallery/wall-selection"
import { expandWallSelectionZipItems } from "@/lib/gallery/wall-selection-zip"
import {
  expandWallSelectionSlideshowPhotos,
  wallSelectionToSlideshowPhotos,
} from "@/lib/gallery/slideshow"
import {
  mergeGalleryWallPage,
  restoreGalleryWallOrder,
  shuffleGalleryWallOrder,
} from "@/lib/gallery/wall-shuffle"
import { cn } from "@workspace/ui/lib/utils"

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
  pinAvailable = true,
  favoritesAvailable = true,
  albumsAvailable = true,
  tagsAvailable = true,
  reactionsAvailable = true,
  commentsAvailable = true,
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
  pinAvailable?: boolean
  favoritesAvailable?: boolean
  albumsAvailable?: boolean
  tagsAvailable?: boolean
  reactionsAvailable?: boolean
  commentsAvailable?: boolean
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
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionSlideshowOpen, setSelectionSlideshowOpen] = useState(false)
  const selectionAnchorIdRef = useRef<string | null>(null)
  const loadOrderIdsRef = useRef(initialImages.map((image) => image.id))
  const shuffledRef = useRef(false)
  const prefetchingRef = useRef(false)
  const prefetchedRef = useRef<PrefetchedPage | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lightboxOpen = Boolean(openPhotoId) && !selectionMode

  useEffect(() => {
    shuffledRef.current = shuffled
  }, [shuffled])

  const filtersInput = useMemo(
    () => ({
      uploader: filters.uploaderId ?? undefined,
      media: filters.media !== "all" ? filters.media : undefined,
      after: filters.uploadedAfter ?? undefined,
      q: filters.query ?? undefined,
      tag: filters.tagSlug ?? undefined,
      saved: filters.savedOnly ? "1" : undefined,
      album: filters.albumSlug ?? undefined,
    }),
    [filters]
  )

  useEffect(() => {
    warmThumbUrls(images)
  }, [images])

  // Filter changes remount a new page payload; drop a stale selection.
  useEffect(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [filtersInput])

  const wallIds = useMemo(() => images.map((image) => image.id), [images])
  const orderedSelected = useMemo(
    () => orderedSelectedWallIds(wallIds, selectedIds),
    [selectedIds, wallIds]
  )
  const selectedZipItems = useMemo(
    () => expandWallSelectionZipItems(orderedSelected, images),
    [images, orderedSelected]
  )
  const selectedSlideshowPhotos = useMemo(
    () => wallSelectionToSlideshowPhotos(orderedSelected, images),
    [images, orderedSelected]
  )
  const selectedStorySlideshowPhotos = useMemo(
    () => expandWallSelectionSlideshowPhotos(orderedSelected, images),
    [images, orderedSelected]
  )
  const allSelected =
    wallIds.length > 0 && wallIds.every((id) => selectedIds.has(id))

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
    }, 180)

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

  const onArtworkRenamed = useCallback(
    (_imageId: string, patches: ArtworkNamePatch[]) => {
      setImages((prev) =>
        prev.map((image) => applyArtworkRenamePatches(image, patches))
      )
    },
    []
  )

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((mode) => {
      if (mode) setSelectedIds(new Set())
      return !mode
    })
  }, [])

  const clearSelection = useCallback(() => {
    selectionAnchorIdRef.current = null
    setSelectedIds(new Set())
  }, [])

  const toggleSelected = useCallback(
    (imageId: string, options?: { shiftKey?: boolean }) => {
      const anchor = selectionAnchorIdRef.current
      setSelectedIds((prev) => {
        if (options?.shiftKey && anchor) {
          return selectWallIdRange(prev, wallIds, anchor, imageId)
        }
        return toggleWallSelection(prev, imageId)
      })
      if (!options?.shiftKey) {
        selectionAnchorIdRef.current = imageId
      }
    },
    [wallIds]
  )

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => toggleSelectAllWallIds(prev, wallIds))
  }, [wallIds])

  return (
    <>
      {images.length > 0 ? (
        <GalleryWallToolbar
          canShuffle={images.length > 1 && !lightboxOpen && !selectionMode}
          shuffled={shuffled}
          onShuffle={onShuffle}
          onRestoreOrder={onRestoreOrder}
          lightboxOpen={lightboxOpen}
          statusText={
            selectionMode
              ? "Select mode · Shift+click for ranges · bulk tools below"
              : undefined
          }
          leadingActions={
            <GalleryWallSelectBar
              selectionMode={selectionMode}
              selectedCount={orderedSelected.length}
              allSelected={allSelected}
              isSignedIn={isSignedIn}
              isAdmin={isAdmin}
              pinAvailable={pinAvailable}
              favoritesAvailable={favoritesAvailable}
              albumsAvailable={albumsAvailable}
              tagsAvailable={tagsAvailable}
              selectedIds={orderedSelected}
              selectedZipItems={selectedZipItems}
              selectedSlideshowPhotos={selectedSlideshowPhotos}
              selectedStorySlideshowPhotos={selectedStorySlideshowPhotos}
              savedFilterActive={Boolean(filters.savedOnly)}
              albumFilterSlug={filters.albumSlug}
              tagFilterSlug={filters.tagSlug}
              onToggleMode={toggleSelectionMode}
              onToggleSelectAll={toggleSelectAll}
              onClear={clearSelection}
              onUnsaved={() => {
                if (!filters.savedOnly) return
                const remove = new Set(orderedSelected)
                setImages((prev) =>
                  prev.filter((image) => !remove.has(image.id))
                )
              }}
              onPinned={(pinned) => {
                const ids = new Set(orderedSelected)
                const pinnedAt = pinned ? new Date().toISOString() : null
                setImages((prev) =>
                  prev.map((image) =>
                    ids.has(image.id)
                      ? { ...image, pinned_at: pinnedAt }
                      : image
                  )
                )
              }}
              onRemovedFromAlbum={() => {
                if (!filters.albumSlug) return
                const remove = new Set(orderedSelected)
                setImages((prev) =>
                  prev.filter((image) => !remove.has(image.id))
                )
              }}
              onUntagged={() => {
                if (!filters.tagSlug) return
                const remove = new Set(orderedSelected)
                setImages((prev) =>
                  prev.filter((image) => !remove.has(image.id))
                )
              }}
              onSlideshowOpenChange={setSelectionSlideshowOpen}
            />
          }
        />
      ) : null}
      <GalleryGrid
        images={images}
        isSignedIn={isSignedIn}
        viewerId={viewerId}
        viewerName={viewerName}
        members={members}
        isAdmin={isAdmin}
        pinAvailable={pinAvailable}
        favoritesAvailable={favoritesAvailable}
        albumsAvailable={albumsAvailable}
        tagsAvailable={tagsAvailable}
        reactionsAvailable={reactionsAvailable}
        commentsAvailable={commentsAvailable}
        openPhotoId={selectionMode ? null : openPhotoId}
        openCommentId={selectionMode ? null : openCommentId}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        filters={filters}
        wallEpoch={wallEpoch}
        onArtworkRenamed={onArtworkRenamed}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onExitSelectionMode={() => {
          setSelectionMode(false)
          setSelectedIds(new Set())
        }}
        onToggleSelectAll={toggleSelectAll}
        suspendKeyboard={selectionSlideshowOpen}
      />
      {hasMore && !loadError ? (
        <div ref={sentinelRef} className="h-10" aria-hidden />
      ) : null}
      {loadingMore ? (
        <div
          className="mx-auto grid max-w-3xl grid-cols-3 gap-4 py-10 sm:gap-6"
          aria-hidden
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="gallery-wall-load-skeleton aspect-[4/5] animate-pulse rounded-[2px]"
              style={{
                animationDelay: `${i * 90}ms`,
                transform: `rotate(${i === 1 ? 1.5 : i === 2 ? -1.2 : -0.6}deg)`,
              }}
            />
          ))}
        </div>
      ) : null}
      {loadingMore ? <p className="sr-only">Loading more photos</p> : null}
      {!hasMore && !loadingMore && !loadError && images.length > 0 ? (
        <p
          className={cn(
            "mx-auto max-w-sm py-10 text-center text-[11px] tracking-[0.16em] text-muted-foreground uppercase"
          )}
        >
          End of the wall
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
