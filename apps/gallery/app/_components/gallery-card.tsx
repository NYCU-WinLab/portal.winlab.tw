"use client"

import {
  useEffect,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react"

import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"

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
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { ReactionBar } from "@/app/_components/reaction-bar"
import { GalleryComments } from "@/app/_components/gallery-comments"
import { ReactionGlyph } from "@/app/_components/reaction-glyph"
import { setGalleryReaction } from "@/app/actions"
import { getRotation } from "@/lib/gallery/rotation"
import {
  GALLERY_REACTIONS,
  type GalleryReaction,
  type ReactionCounts,
  type ReactionNames,
  totalReactions,
} from "@/lib/gallery/reactions"
import type {
  GalleryImage,
  GalleryMember,
  GallerySequenceItem,
} from "@/lib/gallery/types"
import { getGalleryImageUrl } from "@/lib/gallery/url"

function applyReactionOptimistic(
  prev: GalleryReaction | null,
  reaction: GalleryReaction,
  viewerName: string,
  setCounts: Dispatch<SetStateAction<ReactionCounts>>,
  setNamesByReaction: Dispatch<SetStateAction<ReactionNames>>,
  setMyReaction: Dispatch<SetStateAction<GalleryReaction | null>>
) {
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
    return "removed" as const
  }
  if (prev) {
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
    return "updated" as const
  }
  setCounts((c) => ({ ...c, [reaction]: c[reaction] + 1 }))
  setNamesByReaction((n) => ({
    ...n,
    [reaction]: n[reaction].includes(viewerName)
      ? n[reaction]
      : [...n[reaction], viewerName],
  }))
  setMyReaction(reaction)
  return "added" as const
}

function mediaUrlFromItem(item: GallerySequenceItem): string {
  return getGalleryImageUrl(item.image_path)
}

function posterUrlFromItem(item: GallerySequenceItem): string | null {
  return item.poster_path ? getGalleryImageUrl(item.poster_path) : null
}

export function GalleryCard({
  image,
  isSignedIn,
  viewerId,
  viewerName,
  members,
}: {
  image: GalleryImage
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
}) {
  const rotation = getRotation(image.id)
  const sequenceMedia: GallerySequenceItem[] =
    image.sequence_items.length > 0
      ? image.sequence_items
      : [
          {
            id: image.id,
            name: image.name,
            image_path: image.image_path,
            media_type: image.media_type,
            poster_path: image.poster_path,
          },
        ]
  const isSequence = sequenceMedia.length > 1
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItem = sequenceMedia[activeIndex] ?? sequenceMedia[0]
  const activeIsVideo = activeItem?.media_type === "video"
  const mediaUrl = activeItem ? mediaUrlFromItem(activeItem) : ""
  const thumbUrl = activeItem
    ? activeIsVideo && activeItem.poster_path
      ? (posterUrlFromItem(activeItem) ?? mediaUrlFromItem(activeItem))
      : mediaUrlFromItem(activeItem)
    : ""
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState(image.reaction_counts)
  const [myReaction, setMyReaction] = useState(image.my_reaction)
  const [namesByReaction, setNamesByReaction] = useState(image.reaction_names)

  const canReact = isSignedIn && !isPending
  const reactionTotal = totalReactions(counts)

  useEffect(() => {
    if (isDialogOpen) return
    setActiveIndex(0)
    setLightboxFailed(false)
  }, [isDialogOpen])

  useEffect(() => {
    setLightboxFailed(false)
  }, [activeIndex])

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

      const outcome = applyReactionOptimistic(
        myReaction,
        reaction,
        viewerName,
        setCounts,
        setNamesByReaction,
        setMyReaction
      )
      if (outcome === "removed") toast.success("Reaction removed.")
      else if (outcome === "updated") toast.success("Reaction updated.")
      else toast.success("Reaction added.")
    })
  }

  return (
    <figure className="w-full">
      <div className="flex justify-center px-3 py-4 sm:px-4 sm:py-5">
        <div
          className={cn(
            "group/polaroid w-full max-w-full origin-center",
            "transition-transform duration-500 ease-out will-change-transform",
            "[transform:rotate(var(--gallery-rot))]",
            "hover:[transform:rotate(0deg)]"
          )}
          style={
            {
              "--gallery-rot": `${rotation}deg`,
            } as React.CSSProperties
          }
        >
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <div
                className={cn(
                  "relative w-full cursor-pointer overflow-hidden rounded-sm bg-white",
                  "border border-black/[0.06]",
                  "shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.2)]",
                  "transition-shadow duration-500 group-hover/polaroid:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_20px_40px_-12px_rgba(0,0,0,0.22)]"
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
                  alt={activeItem?.name ?? image.name}
                  width={1200}
                  height={1500}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full object-cover"
                  onError={() => setThumbFailed(true)}
                />
                {activeIsVideo ? <PlayBadge /> : null}
                {isSequence ? (
                  <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-xs text-white">
                    {image.sequence_count} shots
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "!h-[100dvh] !w-screen !max-w-none !rounded-none border-0 bg-transparent p-2 shadow-none ring-0"
          )}
        >
          <DialogTitle className="sr-only">
            {activeItem?.name ?? image.name}
          </DialogTitle>
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
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-background/95 shadow-2xl md:flex-row">
            <div className="relative flex min-h-[42vh] min-w-0 flex-1 items-center justify-center bg-black/70 p-4 md:min-h-0 md:min-w-[22rem]">
              {lightboxFailed ? (
                <div className="max-w-[95vw] rounded-sm bg-muted px-8 py-16 text-center text-muted-foreground italic shadow-2xl">
                  This {activeIsVideo ? "video" : "image"} cannot be previewed
                  in your browser.
                </div>
              ) : activeIsVideo ? (
                <video
                  src={mediaUrl}
                  poster={
                    activeItem
                      ? (posterUrlFromItem(activeItem) ?? undefined)
                      : undefined
                  }
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="block h-auto max-h-[calc(100dvh-5.5rem)] w-auto max-w-full bg-black object-contain shadow-2xl"
                  onError={() => setLightboxFailed(true)}
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt={activeItem?.name ?? image.name}
                  className="block h-auto max-h-[calc(100dvh-5.5rem)] w-auto max-w-full bg-white object-contain shadow-2xl"
                  onError={() => setLightboxFailed(true)}
                />
              )}
              {isSequence ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((idx) =>
                        idx === 0 ? sequenceMedia.length - 1 : idx - 1
                      )
                    }
                    className="absolute top-1/2 left-3 z-[60] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                    aria-label="Previous photo"
                  >
                    <IconChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((idx) => (idx + 1) % sequenceMedia.length)
                    }
                    className="absolute top-1/2 right-3 z-[60] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                    aria-label="Next photo"
                  >
                    <IconChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute right-0 bottom-3 left-0 z-[60] mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4">
                    {sequenceMedia.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full bg-white/50 transition-colors",
                          idx === activeIndex && "bg-white"
                        )}
                        aria-label={`View shot ${idx + 1}`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <aside className="flex min-h-0 w-full flex-col border-t border-border/60 bg-background md:w-[24rem] md:shrink-0 md:border-t-0 md:border-l">
              <div className="border-b border-border/60 px-4 py-3">
                <p className="truncate text-base text-foreground">
                  {image.name}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  by {image.uploader_name}
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                <GalleryComments
                  imageId={image.id}
                  initialComments={image.comments}
                  isSignedIn={isSignedIn}
                  viewerId={viewerId}
                  viewerName={viewerName}
                  members={members}
                />
              </div>
            </aside>
          </div>
        </DialogContent>
          </Dialog>
        </div>
      </div>
      <figcaption
        className={cn(
          "mt-1 space-y-2.5 font-[family-name:var(--font-caption)] not-italic",
          "text-foreground/90"
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-base leading-snug font-medium text-foreground md:text-lg">
            {image.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground md:text-sm">
            by {image.uploader_name}
          </p>
          {isSequence ? (
            <p className="mt-1 truncate text-[11px] tracking-wide text-muted-foreground/80 uppercase md:text-xs">
              Sequence · {image.sequence_count} shots
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <ReactionSummary
            total={reactionTotal}
            counts={counts}
            namesByReaction={namesByReaction}
          />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className="rounded-full border border-border/80 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground md:text-xs"
            >
              Comments ({image.comments.length})
            </button>
            <ReactionBar
              counts={counts}
              myReaction={myReaction}
              canReact={canReact}
              onReact={onReact}
            />
          </div>
        </div>
      </figcaption>
    </figure>
  )
}

function ReactionSummary({
  total,
  counts,
  namesByReaction,
}: {
  total: number
  counts: ReactionCounts
  namesByReaction: ReactionNames
}) {
  if (total === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/70 md:text-xs">
        No reactions yet
      </p>
    )
  }

  const entries = GALLERY_REACTIONS.flatMap((reaction) =>
    namesByReaction[reaction].map((name) => ({ reaction, name }))
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground transition-colors select-none hover:text-foreground md:text-xs"
          aria-label="Show who reacted"
        >
          {GALLERY_REACTIONS.filter((r) => counts[r] > 0).map((reaction) => (
            <span
              key={reaction}
              className="inline-flex items-center gap-0.5 whitespace-nowrap"
            >
              <ReactionGlyph reaction={reaction} className="text-sm" />
              <span className="tabular-nums">{counts[reaction]}</span>
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-56 rounded-xl p-3"
      >
        <ul className="max-h-52 space-y-1.5 overflow-y-auto text-sm">
          {entries.map(({ reaction, name }, idx) => (
            <li
              key={`${reaction}-${name}-${idx}`}
              className="flex min-w-0 items-center gap-2 select-none"
            >
              <ReactionGlyph
                reaction={reaction}
                className="shrink-0 text-base"
              />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
