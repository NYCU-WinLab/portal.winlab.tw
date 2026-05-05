"use client"

import { useState, useTransition } from "react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { unvoteGalleryImage, voteGalleryImage } from "@/app/actions"
import { getRotation } from "@/lib/gallery/rotation"
import type { GalleryImage } from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"

export function GalleryCard({
  image,
  isSignedIn,
}: {
  image: GalleryImage
  isSignedIn: boolean
}) {
  const rotation = getRotation(image.id)
  const url = getGalleryImageUrl(image.image_path)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [votedByMe, setVotedByMe] = useState(image.voted_by_me)
  const [voteCount, setVoteCount] = useState(image.vote_count)

  const canToggleVote = isSignedIn && !isPending

  const onVote = () => {
    if (!isSignedIn) {
      toast.error("Please sign in before voting.")
      return
    }

    startTransition(async () => {
      const result = votedByMe
        ? await unvoteGalleryImage(image.id)
        : await voteGalleryImage(image.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (votedByMe) {
        setVotedByMe(false)
        setVoteCount((n) => Math.max(0, n - 1))
        toast.success("Vote removed.")
      } else {
        setVotedByMe(true)
        setVoteCount((n) => n + 1)
        toast.success("Vote counted.")
      }
    })
  }

  return (
    <figure
      className={cn(
        "group relative block w-full",
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
      <Dialog>
        <DialogTrigger asChild>
          <div
            className={cn(
              "relative w-full cursor-pointer overflow-hidden bg-white",
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
      <figcaption
        className={cn(
          "mt-4 flex items-center justify-between gap-4 text-2xl leading-snug tracking-wide text-foreground/70",
          "italic md:text-3xl"
        )}
      >
        <span className="truncate">{image.name}</span>
        <button
          type="button"
          onClick={onVote}
          disabled={!canToggleVote}
          aria-label={votedByMe ? "Remove vote" : "Vote for this work"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-base not-italic transition-colors md:text-lg",
            votedByMe
              ? "border-foreground/20 bg-foreground/10 text-foreground"
              : "border-foreground/20 bg-background/80 text-foreground hover:bg-foreground/10",
            !canToggleVote && "cursor-not-allowed opacity-70"
          )}
        >
          <span aria-hidden>{votedByMe ? "✓" : "👍"}</span>
          <span>{voteCount}</span>
        </button>
      </figcaption>
    </figure>
  )
}
