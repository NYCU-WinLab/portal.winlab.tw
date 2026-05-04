"use client"

import Image from "next/image"

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
            <Image
              src={url}
              alt={image.name}
              width={1200}
              height={1500}
              className="h-auto w-full object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
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
        <img
          src={url}
          alt={image.name}
          className="block h-auto max-h-[85vh] w-auto max-w-[95vw] bg-white object-contain shadow-2xl"
        />
        <p className="text-3xl text-white/90 italic md:text-4xl">
          {image.name}
        </p>
      </DialogContent>
    </Dialog>
  )
}
