"use client"

import {
  useEffect,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react"

import Image from "next/image"

import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconX,
} from "@tabler/icons-react"

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
import {
  galleryPillClass,
  galleryPolaroidClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import { setGalleryReaction } from "@/app/actions"
import { formatUploadedAt } from "@/lib/gallery/format-uploaded-at"
import { getPolaroidFrame } from "@/lib/gallery/polaroid-frame"
import { getRotation } from "@/lib/gallery/rotation"
import {
  GALLERY_REACTIONS,
  type GalleryReaction,
  type ReactionCounts,
  type ReactionNames,
  totalReactions,
} from "@/lib/gallery/reactions"
import type {
  GalleryComment,
  GalleryImage,
  GalleryMember,
  GallerySequenceItem,
} from "@/lib/gallery/types"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"

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

function thumbUrlFromItem(item: GallerySequenceItem): string {
  if (item.media_type === "video" && item.poster_path) {
    return getGalleryThumbUrl(item.poster_path)
  }
  return getGalleryThumbUrl(item.image_path)
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
  priorityLcp = false,
}: {
  image: GalleryImage
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  priorityLcp?: boolean
}) {
  const rotation = getRotation(image.id)
  const frame = getPolaroidFrame(image.id)
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
            created_at: image.created_at,
          },
        ]
  const isSequence = sequenceMedia.length > 1
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItem = sequenceMedia[activeIndex] ?? sequenceMedia[0]
  const uploadedAt = activeItem?.created_at ?? image.created_at
  const activeIsVideo = activeItem?.media_type === "video"
  const mediaUrl = activeItem ? mediaUrlFromItem(activeItem) : ""
  const thumbUrl = activeItem ? thumbUrlFromItem(activeItem) : ""
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState(image.reaction_counts)
  const [myReaction, setMyReaction] = useState(image.my_reaction)
  const [namesByReaction, setNamesByReaction] = useState(image.reaction_names)
  const [comments, setComments] = useState<GalleryComment[]>(image.comments)

  const canReact = isSignedIn && !isPending
  const reactionTotal = totalReactions(counts)

  useEffect(() => {
    setComments(image.comments)
  }, [image.comments])

  useEffect(() => {
    if (isDialogOpen) return
    setActiveIndex(0)
    setLightboxFailed(false)
    setMobileDetailsOpen(false)
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
    <figure className={cn("mx-auto w-full sm:max-w-none", frame.maxWidthClass)}>
      <div className="flex justify-center px-3 py-3 sm:px-4 sm:py-4">
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
              <button
                type="button"
                className="block w-full rounded-[2px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className={galleryPolaroidClass()}>
                  {thumbFailed ? (
                    <div
                      className={cn(
                        "flex w-full items-center justify-center bg-muted/80 px-4 text-center text-xs text-muted-foreground",
                        frame.aspectClass
                      )}
                    >
                      Preview unavailable
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative overflow-hidden bg-neutral-100",
                        frame.aspectClass
                      )}
                    >
                      <Image
                        src={thumbUrl}
                        alt={activeItem?.name ?? image.name}
                        fill
                        priority={priorityLcp}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        onError={() => setThumbFailed(true)}
                      />
                      {activeIsVideo ? <PlayBadge /> : null}
                      {isSequence ? (
                        <div
                          className={cn(
                            gallerySans(),
                            "absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
                          )}
                        >
                          {image.sequence_count} shots
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="gallery-polaroid-caption px-3 pt-3 pb-4">
                    <p
                      className={cn(
                        gallerySerif(),
                        "truncate text-center text-sm leading-snug text-foreground/85"
                      )}
                    >
                      {image.name}
                    </p>
                    <p
                      className={cn(
                        gallerySans(),
                        "mt-1 truncate text-center text-[10px] text-muted-foreground"
                      )}
                    >
                      {image.uploader_name}
                    </p>
                  </div>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent
              showCloseButton={false}
              className={cn(
                "gallery-lightbox",
                "!fixed !inset-0 !top-0 !left-0 !z-[100]",
                "!h-dvh !max-h-none !w-screen !max-w-none",
                "!translate-x-0 !translate-y-0 !translate-none",
                "!gap-0 !overflow-hidden !rounded-none !border-0 !bg-transparent !p-0 !shadow-none !ring-0",
                "sm:!max-w-none",
                "data-open:animate-none data-closed:animate-none"
              )}
            >
              <DialogTitle className="sr-only">
                {activeItem?.name ?? image.name}
              </DialogTitle>
              <DialogClose
                aria-label="Close"
                className={cn(
                  "absolute top-[max(env(safe-area-inset-top),0.75rem)] right-[max(env(safe-area-inset-right),0.75rem)] z-20",
                  "inline-flex h-11 w-11 items-center justify-center rounded-full",
                  "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
                  "transition-colors hover:bg-white",
                  "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                )}
              >
                <IconX className="h-5 w-5" />
              </DialogClose>
              <div className="gallery-lightbox-layout">
                <div className="gallery-lightbox-media">
                  {lightboxFailed ? (
                    <div className="max-w-[95vw] rounded-sm bg-muted px-8 py-16 text-center text-muted-foreground italic shadow-2xl">
                      This {activeIsVideo ? "video" : "image"} cannot be
                      previewed in your browser.
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
                      className="gallery-lightbox-image"
                      onError={() => setLightboxFailed(true)}
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt={activeItem?.name ?? image.name}
                      className="gallery-lightbox-image"
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
                        className="absolute top-1/2 left-3 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        aria-label="Previous photo"
                      >
                        <IconChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex(
                            (idx) => (idx + 1) % sequenceMedia.length
                          )
                        }
                        className="absolute top-1/2 right-3 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        aria-label="Next photo"
                      >
                        <IconChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute right-0 bottom-3 left-0 z-10 mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4">
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
                <aside
                  className={cn(
                    "gallery-lightbox-aside",
                    mobileDetailsOpen && "gallery-lightbox-aside--expanded"
                  )}
                >
                  <button
                    type="button"
                    className="gallery-lightbox-aside-toggle md:hidden"
                    aria-expanded={mobileDetailsOpen}
                    onClick={() => setMobileDetailsOpen((open) => !open)}
                  >
                    <span
                      aria-hidden
                      className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border/80"
                    />
                    <span className="flex w-full items-center justify-between gap-3 pt-2">
                      <span className="min-w-0 text-left">
                        <span
                          className={cn(
                            gallerySerif(),
                            "block truncate text-base leading-snug text-foreground"
                          )}
                        >
                          {activeItem?.name ?? image.name}
                        </span>
                        <span
                          className={cn(
                            gallerySans(),
                            "mt-0.5 block text-[11px] text-muted-foreground"
                          )}
                        >
                          {comments.length > 0
                            ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
                            : "Comments & reactions"}
                        </span>
                      </span>
                      <IconChevronUp
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          mobileDetailsOpen && "rotate-180"
                        )}
                      />
                    </span>
                  </button>
                  <div className="gallery-lightbox-aside-header space-y-3 border-b border-border/50 px-4 py-3 sm:px-5">
                    <div className="min-w-0 space-y-0.5">
                      <h2
                        className={cn(
                          gallerySerif(),
                          "text-lg leading-snug text-foreground sm:text-xl"
                        )}
                      >
                        {activeItem?.name ?? image.name}
                      </h2>
                      <p
                        className={cn(
                          gallerySans(),
                          "text-xs text-muted-foreground"
                        )}
                      >
                        by {image.uploader_name}
                        {uploadedAt ? (
                          <>
                            <span aria-hidden> · </span>
                            <time dateTime={uploadedAt}>
                              {formatUploadedAt(uploadedAt)}
                            </time>
                          </>
                        ) : null}
                      </p>
                      {isSequence ? (
                        <p
                          className={cn(
                            gallerySans(),
                            "text-[11px] text-muted-foreground/70"
                          )}
                        >
                          Shot {activeIndex + 1} of {sequenceMedia.length}
                        </p>
                      ) : null}
                    </div>
                    <ReactionBar
                      counts={counts}
                      myReaction={myReaction}
                      canReact={canReact}
                      onReact={onReact}
                    />
                  </div>
                  <div className="gallery-lightbox-aside-comments flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-5">
                    <GalleryComments
                      imageId={image.id}
                      comments={comments}
                      onCommentsChange={setComments}
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
      <figcaption className={cn(gallerySans(), "mt-3 space-y-2")}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            reactionTotal > 0 ? "justify-between" : "justify-end"
          )}
        >
          <ReactionSummary
            total={reactionTotal}
            counts={counts}
            namesByReaction={namesByReaction}
          />
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileDetailsOpen(true)
                setIsDialogOpen(true)
              }}
              className={galleryPillClass()}
            >
              {comments.length > 0
                ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
                : "Comment"}
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
  if (total === 0) return null

  const entries = GALLERY_REACTIONS.flatMap((reaction) =>
    namesByReaction[reaction].map((name) => ({ reaction, name }))
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            galleryPillClass(),
            "max-w-full flex-wrap gap-x-1.5 gap-y-1"
          )}
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
