"use client"

import { GalleryCard } from "@/app/_components/gallery-card"
import { GalleryEmptyState } from "@/components/gallery-chrome"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export function GalleryGrid({
  images,
  isSignedIn,
  viewerId,
  viewerName,
  members,
}: {
  images: GalleryImage[]
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
}) {
  if (images.length === 0) {
    return (
      <GalleryEmptyState
        title="Nothing on the wall yet"
        description="Be the first to hang something — sign in and head to Manage."
      />
    )
  }

  return (
    <div className="columns-1 gap-x-5 sm:columns-2 sm:gap-x-7 lg:columns-3 lg:gap-x-8">
      {images.map((image, index) => (
        <div
          key={image.id}
          className="mb-9 w-full max-w-full break-inside-avoid sm:mb-11 lg:mb-12"
        >
          <GalleryCard
            image={image}
            isSignedIn={isSignedIn}
            viewerId={viewerId}
            viewerName={viewerName}
            members={members}
            priorityLcp={index === 0}
          />
        </div>
      ))}
    </div>
  )
}
