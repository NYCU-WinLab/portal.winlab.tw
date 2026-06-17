"use client"

import { GalleryCard } from "@/app/_components/gallery-card"
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
      <p className="text-center text-3xl text-muted-foreground italic md:text-4xl">
        Nothing on the walls yet.
      </p>
    )
  }

  return (
    <div className="columns-1 gap-x-6 sm:columns-2 sm:gap-x-8 lg:columns-3 lg:gap-x-10">
      {images.map((image) => (
        <div
          key={image.id}
          className="mb-8 w-full max-w-full break-inside-avoid sm:mb-10 lg:mb-12"
        >
          <GalleryCard
            image={image}
            isSignedIn={isSignedIn}
            viewerId={viewerId}
            viewerName={viewerName}
            members={members}
          />
        </div>
      ))}
    </div>
  )
}
