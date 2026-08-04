"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { GalleryCard } from "@/app/_components/gallery-card"
import {
  GalleryEmptyState,
  galleryNavLinkClass,
} from "@/components/gallery-chrome"
import {
  buildGalleryHomeHref,
  describeGalleryFilterSummary,
  hasActiveGalleryFilters,
  type GalleryHomeFilters,
} from "@/lib/gallery/home-filters"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export function GalleryGrid({
  images,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  isAdmin = false,
  openPhotoId = null,
  openCommentId = null,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  filters,
  wallEpoch = 0,
}: {
  images: GalleryImage[]
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin?: boolean
  openPhotoId?: string | null
  openCommentId?: string | null
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<void>
  filters?: GalleryHomeFilters
  /** Bumps when the wall is reshuffled so settle animation replays. */
  wallEpoch?: number
}) {
  const router = useRouter()
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
      router.replace(
        buildGalleryPhotoHref({
          photoId: nextImage.id,
          commentId: null,
        }),
        { scroll: false }
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
    router.replace(
      buildGalleryPhotoHref({
        photoId: nextImage.id,
        commentId: null,
      }),
      { scroll: false }
    )
  }

  const closeLightbox = () => {
    setOpenIndex(null)
    const params = new URLSearchParams(window.location.search)
    params.delete("photo")
    params.delete("comment")
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (openIndex !== null) return

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
  }, [focusIndex, hasMore, images.length, loadingMore, onLoadMore, openIndex])

  if (images.length === 0) {
    const filtersActive = filters ? hasActiveGalleryFilters(filters) : false
    if (filtersActive && filters) {
      const summary = describeGalleryFilterSummary(filters, members).join(" · ")
      return (
        <GalleryEmptyState
          title="No matches"
          description={
            summary
              ? `Nothing matches ${summary}.`
              : "Nothing matches these filters."
          }
          action={
            <button
              type="button"
              className={galleryNavLinkClass()}
              onClick={() => router.replace(buildGalleryHomeHref({}))}
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
      className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 lg:gap-x-7 lg:gap-y-11"
      aria-label="Gallery wall"
    >
      {images.map((image, index) => (
        <div
          key={image.id}
          className="gallery-wall-card w-full max-w-full"
          style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
        >
          <GalleryCard
            image={image}
            isSignedIn={isSignedIn}
            viewerId={viewerId}
            viewerName={viewerName}
            members={members}
            isAdmin={isAdmin}
            priorityLcp={index === 0}
            initialOpen={false}
            highlightCommentId={openPhotoId === image.id ? openCommentId : null}
            open={openIndex === index}
            onOpenChange={(open) => {
              if (open) {
                setOpenIndex(index)
                router.replace(
                  buildGalleryPhotoHref({
                    photoId: image.id,
                    commentId: openPhotoId === image.id ? openCommentId : null,
                  }),
                  { scroll: false }
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
          />
        </div>
      ))}
    </div>
  )
}
