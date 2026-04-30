"use client"

import { useEffect, useState } from "react"

import { GalleryCard } from "@/app/_components/gallery-card"
import type { GalleryImage } from "@/lib/gallery/types"

const BREAKPOINTS = [
  { minWidth: 1024, cols: 3 },
  { minWidth: 768, cols: 2 },
  { minWidth: 0, cols: 1 },
] as const

function pickCols(width: number): number {
  for (const bp of BREAKPOINTS) if (width >= bp.minWidth) return bp.cols
  return 1
}

export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  // SSR seeds with 3-col layout (desktop default). useEffect rebuckets on
  // mount and on resize. The seed shape stays stable so React doesn't blow
  // up hydration: same number of buckets, same DOM shape.
  const [cols, setCols] = useState(3)

  useEffect(() => {
    const update = () => setCols(pickCols(window.innerWidth))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  if (images.length === 0) {
    return (
      <p className="text-center text-3xl text-muted-foreground italic md:text-4xl">
        Nothing on the walls yet.
      </p>
    )
  }

  // Round-robin bucket distribution. images[i] → buckets[i % cols].
  // Guarantees every image lands in some column, no balance-algorithm
  // surprises and no whitespace-of-doom.
  const buckets: GalleryImage[][] = Array.from({ length: cols }, () => [])
  images.forEach((image, i) => {
    const bucket = buckets[i % cols]
    if (bucket) bucket.push(image)
  })

  return (
    <div className="flex gap-12">
      {buckets.map((bucket, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-12">
          {bucket.map((image) => (
            <GalleryCard key={image.id} image={image} />
          ))}
        </div>
      ))}
    </div>
  )
}
