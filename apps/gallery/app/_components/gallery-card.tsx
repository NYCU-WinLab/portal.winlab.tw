"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { getRotation } from "@/lib/gallery/rotation"
import type { GalleryImage } from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"

export function GalleryCard({ image }: { image: GalleryImage }) {
  const rotation = getRotation(image.id)
  const url = getGalleryImageUrl(image.image_path)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <figure
          className={cn(
            "group relative block w-full cursor-pointer",
            "transition-transform duration-500 ease-out will-change-transform",
            "[transform:rotate(var(--gallery-rot))]",
            "hover:[transform:rotate(0deg)_scale(1.02)]"
          )}
          style={
            {
              "--gallery-rot": `${rotation}deg`,
            } as React.CSSProperties
          }
        >
          <div
            className={cn(
              "relative w-full overflow-hidden bg-white",
              "border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.18)]"
            )}
          >
            {thumbFailed ? (
              <div className="flex aspect-[4/5] w-full items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground italic">
                Preview unavailable (try Safari for HEIC, or export as JPEG)
              </div>
            ) : (
              <img
                src={url}
                alt={image.name}
                width={1200}
                height={1500}
                loading="lazy"
                decoding="async"
                className="h-auto w-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            )}
          </div>
          <figcaption
            className={cn(
              "mt-4 text-center text-2xl leading-snug tracking-wide text-foreground/70",
              "italic md:text-3xl"
            )}
          >
            {image.name}
          </figcaption>
        </figure>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[95vh] w-auto max-w-[95vw] flex-col items-center justify-center gap-6 overflow-visible !rounded-none border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[95vw]"
        )}
      >
        <DialogTitle className="sr-only">{image.name}</DialogTitle>
        {lightboxFailed ? (
          <div className="max-w-[95vw] rounded-sm bg-muted px-8 py-16 text-center text-muted-foreground italic shadow-2xl">
            This image cannot be previewed in your browser (common with HEIC).
            Export as JPEG/PNG or open this page in Safari.
          </div>
        ) : (
          <img
            src={url}
            alt={image.name}
            className="block h-auto max-h-[85vh] w-auto max-w-[95vw] bg-white object-contain shadow-2xl"
            onError={() => setLightboxFailed(true)}
          />
        )}
        <p className="text-3xl text-white/90 italic md:text-4xl">
          {image.name}
        </p>
      </DialogContent>
    </Dialog>
  )
}
