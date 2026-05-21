"use client"

import { useState, useTransition } from "react"

import { IconX } from "@tabler/icons-react"

import {
  Dialog,
  DialogClose,
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

import { setGalleryReaction } from "@/app/actions"
import { getRotation } from "@/lib/gallery/rotation"
import {
  GALLERY_REACTIONS,
  REACTION_EMOJI,
  REACTION_LABEL,
  type GalleryReaction,
  type ReactionCounts,
  type ReactionNames,
  formatReactionSummary,
  totalReactions,
} from "@/lib/gallery/reactions"
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
  const thumbUrl =
    isVideo && image.poster_path
      ? getGalleryImageUrl(image.poster_path)
      : mediaUrl
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState(image.reaction_counts)
  const [myReaction, setMyReaction] = useState(image.my_reaction)
  const [namesByReaction, setNamesByReaction] = useState(image.reaction_names)

  const canReact = isSignedIn && !isPending
  const reactionTotal = totalReactions(counts)
  const summary = formatReactionSummary(counts)

  const onReact = (reaction: GalleryReaction) => {
    if (!isSignedIn) {
      toast.error("Please sign in before reacting.")
      return
    }

    startTransition(async () => {
      const result = await setGalleryReaction(image.id, reaction)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const prev = myReaction
      if (prev === reaction) {
        setCounts((c) => ({
          ...c,
          [reaction]: Math.max(0, c[reaction] - 1),
        }))
        setNamesByReaction((n) => ({
          ...n,
          [reaction]: n[reaction].filter((name) => name !== viewerName),
        }))
        setMyReaction(null)
        toast.success("Reaction removed.")
      } else if (prev) {
        setCounts((c) => ({
          ...c,
          [prev]: Math.max(0, c[prev] - 1),
          [reaction]: c[reaction] + 1,
        }))
        setNamesByReaction((n) => ({
          ...n,
          [prev]: n[prev].filter((name) => name !== viewerName),
          [reaction]: n[reaction].includes(viewerName)
            ? n[reaction]
            : [...n[reaction], viewerName],
        }))
        setMyReaction(reaction)
        toast.success("Reaction updated.")
      } else {
        setCounts((c) => ({ ...c, [reaction]: c[reaction] + 1 }))
        setNamesByReaction((n) => ({
          ...n,
          [reaction]: n[reaction].includes(viewerName)
            ? n[reaction]
            : [...n[reaction], viewerName],
        }))
        setMyReaction(reaction)
        toast.success("Reaction added.")
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
            "flex h-[100dvh] w-screen max-w-none items-center justify-center !rounded-none border-0 bg-transparent p-4 shadow-none ring-0",
            "sm:h-auto sm:max-h-[95vh] sm:w-auto sm:max-w-[95vw]"
          )}
        >
          <DialogTitle className="sr-only">{image.name}</DialogTitle>
          <DialogClose
            aria-label="Close"
            className={cn(
              "fixed top-[max(env(safe-area-inset-top),1rem)] right-[max(env(safe-area-inset-right),1rem)] z-[60]",
              "inline-flex h-11 w-11 items-center justify-center rounded-full",
              "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
              "transition-colors hover:bg-white",
              "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            )}
          >
            <IconX className="h-5 w-5" />
          </DialogClose>
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
              className="block h-auto max-h-full w-auto max-w-full bg-black object-contain shadow-2xl"
              onError={() => setLightboxFailed(true)}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={image.name}
              className="block h-auto max-h-full w-auto max-w-full bg-white object-contain shadow-2xl"
              onError={() => setLightboxFailed(true)}
            />
          )}
        </DialogContent>
      </Dialog>
      <figcaption
        className={cn(
          "mt-4 flex flex-col gap-3 text-2xl leading-snug tracking-wide text-foreground/70 sm:flex-row sm:items-end sm:justify-between",
          "italic md:text-3xl"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate">{image.name}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground md:text-base">
            by {image.uploader_name}
          </p>
          <ReactionSummary
            total={reactionTotal}
            summary={summary}
            namesByReaction={namesByReaction}
          />
        </div>
        <ReactionBar
          counts={counts}
          myReaction={myReaction}
          canReact={canReact}
          onReact={onReact}
        />
      </figcaption>
    </figure>
  )
}

function ReactionBar({
  counts,
  myReaction,
  canReact,
  onReact,
}: {
  counts: ReactionCounts
  myReaction: GalleryReaction | null
  canReact: boolean
  onReact: (reaction: GalleryReaction) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 not-italic">
      {GALLERY_REACTIONS.map((reaction) => {
        const active = myReaction === reaction
        return (
          <button
            key={reaction}
            type="button"
            onClick={() => onReact(reaction)}
            disabled={!canReact}
            aria-label={
              active
                ? `Remove ${REACTION_LABEL[reaction]}`
                : `React with ${REACTION_LABEL[reaction]}`
            }
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-base transition-colors md:text-lg",
              active
                ? "border-foreground/20 bg-foreground/10 text-foreground"
                : "border-foreground/20 bg-background/80 text-foreground hover:bg-foreground/10",
              !canReact && "cursor-not-allowed opacity-70"
            )}
          >
            <span aria-hidden>{REACTION_EMOJI[reaction]}</span>
            <span>{counts[reaction]}</span>
          </button>
        )
      })}
    </div>
  )
}

function ReactionSummary({
  total,
  summary,
  namesByReaction,
}: {
  total: number
  summary: string
  namesByReaction: ReactionNames
}) {
  if (total === 0) {
    return (
      <p className="mt-1 truncate text-xs text-muted-foreground/70 not-italic md:text-sm">
        No reactions yet
      </p>
    )
  }

  const allNames = GALLERY_REACTIONS.flatMap((r) =>
    namesByReaction[r].map((name) => ({ reaction: r, name }))
  )

  return (
    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground not-italic md:text-sm">
      <p className="min-w-0 truncate">{summary}</p>
      {allNames.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 underline decoration-dotted underline-offset-4 hover:text-foreground"
              aria-label="Show who reacted"
            >
              · names
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-64 rounded-xl p-3"
          >
            <PopoverHeader>
              <PopoverTitle className="text-sm">Reactions</PopoverTitle>
            </PopoverHeader>
            <div className="max-h-52 space-y-3 overflow-y-auto text-sm">
              {GALLERY_REACTIONS.map((reaction) => {
                const names = namesByReaction[reaction]
                if (names.length === 0) return null
                return (
                  <div key={reaction}>
                    <p className="mb-1 font-medium">
                      {REACTION_EMOJI[reaction]} {REACTION_LABEL[reaction]}
                    </p>
                    <ul className="space-y-0.5">
                      {names.map((name, idx) => (
                        <li key={`${reaction}-${name}-${idx}`} className="truncate">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
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
