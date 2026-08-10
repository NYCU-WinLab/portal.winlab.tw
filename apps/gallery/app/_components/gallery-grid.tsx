"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { GalleryCard } from "@/app/_components/gallery-card"
import { GalleryCardBoundary } from "@/app/_components/gallery-card-boundary"
import {
  GalleryEmptyState,
  galleryNavLinkClass,
} from "@/components/gallery-chrome"
import { describeGalleryNavError } from "@/lib/gallery/gallery-nav-errors"
import {
  buildGalleryHomeHref,
  describeGalleryFilteredEmpty,
  hasActiveGalleryFilters,
  type GalleryHomeFilters,
} from "@/lib/gallery/home-filters"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import type { ArtworkNamePatch } from "@/lib/gallery/rename-artwork"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export function GalleryGrid({
  images,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  isAdmin = false,
  pinAvailable = true,
  favoritesAvailable = true,
  albumsAvailable = true,
  tagsAvailable = true,
  reactionsAvailable = true,
  commentsAvailable = true,
  openPhotoId = null,
  openCommentId = null,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  filters,
  wallEpoch = 0,
  onArtworkRenamed,
  selectionMode = false,
  selectedIds,
  onToggleSelected,
  onExitSelectionMode,
  onToggleSelectAll,
  suspendKeyboard = false,
}: {
  images: GalleryImage[]
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin?: boolean
  pinAvailable?: boolean
  favoritesAvailable?: boolean
  albumsAvailable?: boolean
  tagsAvailable?: boolean
  reactionsAvailable?: boolean
  commentsAvailable?: boolean
  openPhotoId?: string | null
  openCommentId?: string | null
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<void>
  filters?: GalleryHomeFilters
  /** Bumps when the wall is reshuffled so settle animation replays. */
  wallEpoch?: number
  onArtworkRenamed?: (imageId: string, patches: ArtworkNamePatch[]) => void
  selectionMode?: boolean
  selectedIds?: ReadonlySet<string>
  onToggleSelected?: (imageId: string, options?: { shiftKey?: boolean }) => void
  onExitSelectionMode?: () => void
  onToggleSelectAll?: () => void
  /** When true, ignore wall/select keyboard (e.g. selection slideshow open). */
  suspendKeyboard?: boolean
}) {
  const router = useRouter()
  const softReplace = (href: string, errorMessage?: string) => {
    try {
      router.replace(href, { scroll: false })
    } catch {
      if (errorMessage) toast.error(errorMessage)
    }
  }
  const [focusIndex, setFocusIndex] = useState(() => {
    if (!openPhotoId) return -1
    const index = images.findIndex((image) => image.id === openPhotoId)
    return index >= 0 ? index : -1
  })
  const [keyboardNavActive, setKeyboardNavActive] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    if (!openPhotoId) return null
    const index = images.findIndex((image) => image.id === openPhotoId)
    return index >= 0 ? index : null
  })
  const pendingAdvanceNextRef = useRef(false)

  useEffect(() => {
    if (!openPhotoId) return
    const index = images.findIndex((image) => image.id === openPhotoId)
    if (index < 0) return
    const timer = window.setTimeout(() => {
      setFocusIndex(index)
      setOpenIndex(index)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [images, openPhotoId])

  useEffect(() => {
    if (!pendingAdvanceNextRef.current || openIndex === null) return
    const nextIndex = openIndex + 1
    if (nextIndex >= images.length) {
      if (!hasMore && !loadingMore) pendingAdvanceNextRef.current = false
      return
    }
    const nextImage = images[nextIndex]
    if (!nextImage) return
    pendingAdvanceNextRef.current = false
    const timer = window.setTimeout(() => {
      setOpenIndex(nextIndex)
      setFocusIndex(nextIndex)
      softReplace(
        buildGalleryPhotoHref({
          photoId: nextImage.id,
          commentId: null,
        }),
        describeGalleryNavError("openNextPhoto")
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [hasMore, images, loadingMore, openIndex, router])

  const navigateWall = (direction: "prev" | "next") => {
    if (openIndex === null) return
    const nextIndex = direction === "prev" ? openIndex - 1 : openIndex + 1
    if (nextIndex < 0) return
    if (nextIndex >= images.length) {
      if (direction === "next" && hasMore && onLoadMore && !loadingMore) {
        pendingAdvanceNextRef.current = true
        void onLoadMore()
      }
      return
    }
    const nextImage = images[nextIndex]
    if (!nextImage) return
    setOpenIndex(nextIndex)
    setFocusIndex(nextIndex)
    softReplace(
      buildGalleryPhotoHref({
        photoId: nextImage.id,
        commentId: null,
      }),
      describeGalleryNavError("openPhoto")
    )
  }

  const closeLightbox = () => {
    setOpenIndex(null)
    const params = new URLSearchParams(window.location.search)
    params.delete("photo")
    params.delete("comment")
    const qs = params.toString()
    softReplace(qs ? `/?${qs}` : "/", describeGalleryNavError("closePhoto"))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (suspendKeyboard) return
      if (openIndex !== null) return

      if (
        event.key === "Escape" &&
        images.length === 0 &&
        filters &&
        hasActiveGalleryFilters(filters)
      ) {
        event.preventDefault()
        softReplace(
          buildGalleryHomeHref({}),
          describeGalleryNavError("clearFilters")
        )
        return
      }

      if (selectionMode) {
        if (event.key === "Escape") {
          event.preventDefault()
          onExitSelectionMode?.()
          return
        }
        if (event.key === "a" || event.key === "A") {
          event.preventDefault()
          onToggleSelectAll?.()
          return
        }
        if (event.key === "j" || event.key === "ArrowRight") {
          event.preventDefault()
          setKeyboardNavActive(true)
          setFocusIndex((index) => {
            const atEnd = index >= images.length - 1
            if (atEnd && hasMore && onLoadMore && !loadingMore) {
              void onLoadMore()
            }
            return Math.min(images.length - 1, Math.max(0, index + 1))
          })
          return
        }
        if (event.key === "k" || event.key === "ArrowLeft") {
          event.preventDefault()
          setKeyboardNavActive(true)
          setFocusIndex((index) => Math.max(0, index - 1))
          return
        }
        if (
          (event.key === " " || event.key === "Enter") &&
          focusIndex >= 0 &&
          onToggleSelected
        ) {
          event.preventDefault()
          const image = images[focusIndex]
          if (image) {
            onToggleSelected(image.id, { shiftKey: event.shiftKey })
          }
        }
        return
      }

      if (event.key === "j" || event.key === "ArrowRight") {
        event.preventDefault()
        setKeyboardNavActive(true)
        setFocusIndex((index) => {
          const atEnd = index >= images.length - 1
          if (atEnd && hasMore && onLoadMore && !loadingMore) {
            void onLoadMore()
          }
          return Math.min(images.length - 1, Math.max(0, index + 1))
        })
        return
      }
      if (event.key === "k" || event.key === "ArrowLeft") {
        event.preventDefault()
        setKeyboardNavActive(true)
        setFocusIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === "Enter" && focusIndex >= 0) {
        event.preventDefault()
        setOpenIndex(focusIndex)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    filters,
    focusIndex,
    hasMore,
    images,
    loadingMore,
    onLoadMore,
    onToggleSelected,
    onExitSelectionMode,
    onToggleSelectAll,
    openIndex,
    router,
    selectionMode,
    suspendKeyboard,
  ])

  if (images.length === 0) {
    const filtersActive = filters ? hasActiveGalleryFilters(filters) : false
    if (filtersActive && filters) {
      const empty = describeGalleryFilteredEmpty(filters, members)
      return (
        <GalleryEmptyState
          title={empty.title}
          description={empty.description}
          action={
            <button
              type="button"
              className={galleryNavLinkClass()}
              onClick={() =>
                softReplace(
                  buildGalleryHomeHref({}),
                  describeGalleryNavError("clearFilters")
                )
              }
            >
              Clear filters
            </button>
          }
        />
      )
    }
    return (
      <GalleryEmptyState
        title="Nothing on the wall yet"
        description="Hang the first polaroid — the lab wall is waiting."
        action={
          isSignedIn ? (
            <Link href="/upload" className={galleryNavLinkClass(true)}>
              Upload a photo
            </Link>
          ) : (
            <Link
              href="/auth/login?next=/upload"
              className={galleryNavLinkClass(true)}
            >
              Sign in to upload
            </Link>
          )
        }
      />
    )
  }

  return (
    <div
      key={wallEpoch}
      className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-9 lg:gap-y-14"
      aria-label="Gallery wall"
    >
      {images.map((image, index) => (
        <div
          key={image.id}
          className="gallery-wall-card w-full max-w-full"
          style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
        >
          <GalleryCardBoundary>
            <GalleryCard
              image={image}
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
              priorityLcp={index === 0}
              initialOpen={false}
              highlightCommentId={
                openPhotoId === image.id ? openCommentId : null
              }
              open={selectionMode ? false : openIndex === index}
              onOpenChange={(open) => {
                if (selectionMode) return
                if (open) {
                  setOpenIndex(index)
                  softReplace(
                    buildGalleryPhotoHref({
                      photoId: image.id,
                      commentId:
                        openPhotoId === image.id ? openCommentId : null,
                    }),
                    describeGalleryNavError("openPhoto")
                  )
                } else {
                  closeLightbox()
                }
              }}
              gridFocused={
                keyboardNavActive && focusIndex === index && openIndex === null
              }
              hasWallPrev={openIndex === index && index > 0}
              hasWallNext={
                openIndex === index && (index < images.length - 1 || hasMore)
              }
              onWallNavigate={openIndex === index ? navigateWall : undefined}
              onArtworkRenamed={
                onArtworkRenamed
                  ? (patches) => onArtworkRenamed(image.id, patches)
                  : undefined
              }
              selectionMode={selectionMode}
              selected={selectedIds?.has(image.id) ?? false}
              onToggleSelected={onToggleSelected}
            />
          </GalleryCardBoundary>
        </div>
      ))}
    </div>
  )
}
