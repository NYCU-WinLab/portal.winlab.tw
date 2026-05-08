"use client"

import { useState, useTransition } from "react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { unvoteGalleryImage, voteGalleryImage } from "@/app/actions"
import { getRotation } from "@/lib/gallery/rotation"
import type { GalleryImage } from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"

export function GalleryCard({
  image,
  isSignedIn,
  viewerName,
}: {
  image: GalleryImage
  isSignedIn: boolean
  viewerName: string
}) {
  const rotation = getRotation(image.id)
  const isVideo = image.media_type === "video"
  const mediaUrl = getGalleryImageUrl(image.image_path)
  // Videos always have a poster (DB constraint). Images render directly.
  const thumbUrl =
    isVideo && image.poster_path
      ? getGalleryImageUrl(image.poster_path)
      : mediaUrl
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [votedByMe, setVotedByMe] = useState(image.voted_by_me)
  const [voteCount, setVoteCount] = useState(image.vote_count)
  const [voterNames, setVoterNames] = useState(image.voter_names)

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
        setVoterNames((names) => names.filter((name) => name !== viewerName))
        toast.success("Vote removed.")
      } else {
        setVotedByMe(true)
        setVoteCount((n) => n + 1)
        setVoterNames((names) =>
          names.includes(viewerName) ? names : [...names, viewerName]
        )
        toast.success("Vote counted.")
      }
    })
  }

  const previewNames = voterNames.slice(0, 2)
  const votersPreview = previewNames.join(", ")
  const votersExtraCount = Math.max(0, voterNames.length - previewNames.length)

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
              <>
                <img
                  src={thumbUrl}
                  alt={image.name}
                  width={1200}
                  height={1500}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full object-cover"
                  onError={() => setThumbFailed(true)}
                />
                {isVideo ? <PlayBadge /> : null}
              </>
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
              This {isVideo ? "video" : "image"} cannot be previewed in your
              browser.
            </div>
          ) : isVideo ? (
            <video
              src={mediaUrl}
              poster={
                image.poster_path
                  ? getGalleryImageUrl(image.poster_path)
                  : undefined
              }
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="block h-auto max-h-[85vh] w-auto max-w-[95vw] bg-black object-contain shadow-2xl"
              onError={() => setLightboxFailed(true)}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={image.name}
              className="block h-auto max-h-[85vh] w-auto max-w-[95vw] bg-white object-contain shadow-2xl"
              onError={() => setLightboxFailed(true)}
            />
          )}
          <p className="text-3xl text-white/90 italic md:text-4xl">
            {image.name}
          </p>
          <p className="text-base text-white/70 italic md:text-lg">
            by {image.uploader_name}
          </p>
          {voterNames.length > 0 ? (
            <p className="text-sm text-white/70">
              Liked by {votersPreview}
              {votersExtraCount > 0 ? ` +${votersExtraCount}` : ""}
            </p>
          ) : (
            <p className="text-sm text-white/60">No likes yet</p>
          )}
        </DialogContent>
      </Dialog>
      <figcaption
        className={cn(
          "mt-4 flex items-center justify-between gap-4 text-2xl leading-snug tracking-wide text-foreground/70",
          "italic md:text-3xl"
        )}
      >
        <div className="min-w-0">
          <p className="truncate">{image.name}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground md:text-base">
            by {image.uploader_name}
          </p>
          {voterNames.length > 0 ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground not-italic md:text-sm">
              <p className="min-w-0 truncate">Liked by {votersPreview}</p>
              {votersExtraCount > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 underline decoration-dotted underline-offset-4 hover:text-foreground"
                      aria-label="Show full like list"
                    >
                      +{votersExtraCount}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={8}
                    className="w-64 rounded-xl p-3"
                  >
                    <PopoverHeader>
                      <PopoverTitle className="text-sm">Liked by</PopoverTitle>
                    </PopoverHeader>
                    <ul className="max-h-52 space-y-1 overflow-y-auto text-sm">
                      {voterNames.map((name, idx) => (
                        <li key={`${name}-${idx}`} className="truncate">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 truncate text-xs text-muted-foreground/70 not-italic md:text-sm">
              No likes yet
            </p>
          )}
        </div>
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

function PlayBadge() {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        "bg-gradient-to-t from-black/30 via-transparent to-transparent"
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  )
}
