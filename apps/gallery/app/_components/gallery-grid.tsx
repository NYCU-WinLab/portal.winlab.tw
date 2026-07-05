"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { GalleryCard } from "@/app/_components/gallery-card"
import { GalleryEmptyState } from "@/components/gallery-chrome"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

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

  useEffect(() => {
    if (!openPhotoId) return
    const index = images.findIndex((image) => image.id === openPhotoId)
    if (index >= 0) {
      setFocusIndex(index)
      setOpenIndex(index)
    }
  }, [images, openPhotoId])

  const navigateWall = (direction: "prev" | "next") => {
    if (openIndex === null) return
    const nextIndex = direction === "prev" ? openIndex - 1 : openIndex + 1
    if (nextIndex < 0) return
    if (nextIndex >= images.length) {
      if (direction === "next" && hasMore && onLoadMore && !loadingMore) {
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
    return (
      <GalleryEmptyState
        title="Nothing on the wall yet"
        description="Be the first to hang something — sign in and head to Manage."
      />
    )
  }

  return (
    <div
      className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 sm:gap-x-7 sm:gap-y-11 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12"
      aria-label="Gallery wall"
    >
      {images.map((image, index) => (
        <div key={image.id} className="w-full max-w-full">
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
