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
  if (images.length === 0) {
    return (
      <GalleryEmptyState
        title="Nothing on the wall yet"
        description="Be the first to hang something — sign in and head to Manage."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 sm:gap-x-7 sm:gap-y-11 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12">
      {images.map((image, index) => (
        <div key={image.id} className="w-full max-w-full">
          <GalleryCard
            image={image}
            isSignedIn={isSignedIn}
            viewerId={viewerId}
            viewerName={viewerName}
            members={members}
            priorityLcp={index === 0}
            initialOpen={openPhotoId === image.id}
            highlightCommentId={openPhotoId === image.id ? openCommentId : null}
          />
        </div>
      ))}
    </div>
  )
}
