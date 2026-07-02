"use client"

import { useEffect, useState } from "react"

import { GalleryCard } from "@/app/_components/gallery-card"
import { GalleryEmptyState } from "@/components/gallery-chrome"
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
  openPhotoId = null,
  openCommentId = null,
}: {
  images: GalleryImage[]
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  openPhotoId?: string | null
  openCommentId?: string | null
}) {
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (openIndex !== null) return

      if (event.key === "j" || event.key === "ArrowRight") {
        event.preventDefault()
        setKeyboardNavActive(true)
        setFocusIndex((index) =>
          Math.min(images.length - 1, Math.max(0, index + 1))
        )
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
  }, [focusIndex, images.length, openIndex])

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
            priorityLcp={index === 0}
            initialOpen={false}
            highlightCommentId={openPhotoId === image.id ? openCommentId : null}
            open={openIndex === index}
            onOpenChange={(open) => {
              if (open) setOpenIndex(index)
              else setOpenIndex(null)
            }}
            gridFocused={
              keyboardNavActive && focusIndex === index && openIndex === null
            }
          />
        </div>
      ))}
    </div>
  )
}
