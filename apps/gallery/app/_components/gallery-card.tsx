"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"

import { IconPin } from "@tabler/icons-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { ReactionBar } from "@/app/_components/reaction-bar"
import { cacheGalleryMediaUrls } from "@/app/_components/gallery-service-worker"
import {
  GalleryLightboxMediaPane,
  GalleryLightboxSocialAside,
} from "@/app/_components/gallery-card-lightbox"
import {
  mediaUrlFromItem,
  PlayBadge,
  thumbUrlFromItem,
} from "@/app/_components/gallery-card-media"
import {
  ReactionSummary,
  useGalleryCardSocial,
} from "@/app/_components/gallery-card-social"
import {
  galleryPillClass,
  galleryPolaroidClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import { useLightboxGestures } from "@/hooks/use-lightbox-gestures"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { describeSequenceGaps } from "@/lib/gallery/manage-uploads"
import { getPolaroidFrame, getPolaroidTape } from "@/lib/gallery/polaroid-frame"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import {
  nextSequenceIndex,
  resolveLightboxNextStep,
  resolveLightboxPrevStep,
} from "@/lib/gallery/lightbox-nav"
import { getRotation } from "@/lib/gallery/rotation"
import type {
  GalleryImage,
  GalleryMember,
  GallerySequenceItem,
} from "@/lib/gallery/types"

/**
 * Polaroid shell + lightbox orchestration.
 * Media/sequence UI → gallery-card-lightbox + gallery-card-media.
 * Reactions/comments/realtime → gallery-card-social.
 */
export function GalleryCard({
  image,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  isAdmin = false,
  priorityLcp = false,
  initialOpen = false,
  highlightCommentId = null,
  open,
  onOpenChange,
  gridFocused = false,
  hasWallPrev = false,
  hasWallNext = false,
  onWallNavigate,
}: {
  image: GalleryImage
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin?: boolean
  priorityLcp?: boolean
  initialOpen?: boolean
  highlightCommentId?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  gridFocused?: boolean
  hasWallPrev?: boolean
  hasWallNext?: boolean
  onWallNavigate?: (direction: "prev" | "next") => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rotation = getRotation(image.id)
  const frame = getPolaroidFrame(image.id)
  const tape = getPolaroidTape(image.id)
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
            sequence_index: image.sequence_index,
          },
        ]
  const isSequence = sequenceMedia.length > 1
  const sequenceGapLabel = describeSequenceGaps(
    image.sequence_missing_indexes ?? []
  )
  const showSequenceBadge = isSequence || Boolean(sequenceGapLabel)
  const [internalOpen, setInternalOpen] = useState(initialOpen)
  const isDialogOpen = open !== undefined ? open : internalOpen
  const setIsDialogOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (open === undefined) setInternalOpen(next)
    if (next) return
    if (open !== undefined) return
    if (!searchParams.has("photo")) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("photo")
    params.delete("comment")
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItem = sequenceMedia[activeIndex] ?? sequenceMedia[0]
  const uploadedAt = activeItem?.created_at ?? image.created_at
  const activeIsVideo = activeItem?.media_type === "video"
  const mediaUrl = activeItem ? mediaUrlFromItem(activeItem) : ""
  const thumbUrl = activeItem ? thumbUrlFromItem(activeItem) : ""
  const [thumbFailed, setThumbFailed] = useState(false)
  const [lightboxFailed, setLightboxFailed] = useState(false)
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)
  const [pinnedAt, setPinnedAt] = useState<string | null>(image.pinned_at)

  const {
    counts,
    myReaction,
    namesByReaction,
    comments,
    setComments,
    canReact,
    reactionTotal,
    wallCommentCount,
    onReact,
  } = useGalleryCardSocial({
    image,
    viewerId,
    viewerName,
    isSignedIn,
    isDialogOpen,
  })

  useEffect(() => {
    setPinnedAt(image.pinned_at)
  }, [image.pinned_at])

  useEffect(() => {
    if (open && highlightCommentId) {
      setMobileDetailsOpen(true)
    }
  }, [open, highlightCommentId])

  const handleDialogOpenChange = (next: boolean) => {
    setIsDialogOpen(next)
  }

  useEffect(() => {
    if (isDialogOpen) return
    setActiveIndex(0)
    setLightboxFailed(false)
    setMobileDetailsOpen(false)
  }, [isDialogOpen])

  useEffect(() => {
    if (!isDialogOpen || !mediaUrl) return
    const urls = [mediaUrl, thumbUrl].filter(Boolean)
    for (const item of sequenceMedia) {
      urls.push(mediaUrlFromItem(item), thumbUrlFromItem(item))
    }
    cacheGalleryMediaUrls(urls)
    // sequenceMedia is derived from image; depend on image id + items length.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid looping on new array identity
  }, [isDialogOpen, mediaUrl, thumbUrl, image.id, image.sequence_items])

  useEffect(() => {
    setLightboxFailed(false)
    setMediaLoaded(false)
  }, [activeIndex, mediaUrl])

  useEffect(() => {
    if (!isDialogOpen) return
    const node = mediaRef.current?.querySelector("img")
    if (node?.complete) setMediaLoaded(true)
  }, [isDialogOpen, mediaUrl, activeIndex])

  const goLightboxPrev = useCallback(() => {
    const step = resolveLightboxPrevStep(
      activeIndex,
      sequenceMedia.length,
      hasWallPrev
    )
    if (step === "sequence") {
      setActiveIndex((idx) => idx - 1)
      return
    }
    if (step === "wall") {
      onWallNavigate?.("prev")
      return
    }
    setActiveIndex((idx) =>
      nextSequenceIndex(idx, sequenceMedia.length, "prev")
    )
  }, [activeIndex, hasWallPrev, onWallNavigate, sequenceMedia.length])

  const goLightboxNext = useCallback(() => {
    const step = resolveLightboxNextStep(
      activeIndex,
      sequenceMedia.length,
      hasWallNext
    )
    if (step === "sequence") {
      setActiveIndex((idx) => idx + 1)
      return
    }
    if (step === "wall") {
      onWallNavigate?.("next")
      return
    }
    setActiveIndex((idx) =>
      nextSequenceIndex(idx, sequenceMedia.length, "next")
    )
  }, [activeIndex, hasWallNext, onWallNavigate, sequenceMedia.length])

  const { gestureProps } = useLightboxGestures(mediaRef, {
    enabled: isDialogOpen,
    onPrev: goLightboxPrev,
    onNext: goLightboxNext,
    onSwipeUp: () => setMobileDetailsOpen(true),
  })

  useEffect(() => {
    if (!isDialogOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        goLightboxPrev()
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        goLightboxNext()
        return
      }
      if (event.key === "i" || event.key === "I") {
        event.preventDefault()
        setMobileDetailsOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [goLightboxNext, goLightboxPrev, isDialogOpen])

  // Prefetch adjacent sequence full-res for snappier story browsing.
  useEffect(() => {
    if (!isDialogOpen) return
    const neighbors = [activeIndex - 1, activeIndex + 1]
      .map((idx) => sequenceMedia[idx])
      .filter(Boolean)
    const urls = neighbors.flatMap((item) => [
      mediaUrlFromItem(item!),
      thumbUrlFromItem(item!),
    ])
    cacheGalleryMediaUrls(urls)
    // sequenceMedia identity changes each render; key off length + active shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment
  }, [activeIndex, isDialogOpen, image.id, sequenceMedia.length])

  const handlePinSuccess = (nextPinnedAt: string | null) => {
    setPinnedAt(nextPinnedAt)
    if (nextPinnedAt) {
      handleDialogOpenChange(false)
      onOpenChange?.(false)
    }
  }

  const copyShareLink = async () => {
    const href = buildGalleryPhotoHref({
      photoId: image.id,
      commentId: highlightCommentId,
    })
    const url = `${window.location.origin}${href}`
    const title = activeItem?.name ?? image.name

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url })
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
    }

    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied.")
    } catch {
      toast.error("Could not copy link.")
    }
  }

  return (
    <figure
      className={cn(
        "mx-auto w-full sm:max-w-none",
        frame.maxWidthClass,
        gridFocused &&
          "rounded-sm ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
    >
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
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <div
              className={cn(
                galleryPolaroidClass(),
                tape === "tl" &&
                  "gallery-polaroid-tape gallery-polaroid-tape--tl",
                tape === "tr" &&
                  "gallery-polaroid-tape gallery-polaroid-tape--tr"
              )}
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="block w-full rounded-[2px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
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
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 44vw, 28vw"
                        className="object-cover"
                        onError={() => setThumbFailed(true)}
                      />
                      {activeIsVideo ? <PlayBadge /> : null}
                      {pinnedAt ? (
                        <div
                          className={cn(
                            gallerySans(),
                            "absolute top-2.5 left-2.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm"
                          )}
                        >
                          <IconPin className="size-3" aria-hidden />
                          Pinned
                        </div>
                      ) : null}
                      {showSequenceBadge ? (
                        <div
                          className={cn(
                            gallerySans(),
                            "absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
                          )}
                        >
                          {sequenceGapLabel
                            ? `Incomplete · ${image.sequence_count}`
                            : `${image.sequence_count} shots`}
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
                  </div>
                </button>
              </DialogTrigger>
            </div>
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
              <div className="gallery-lightbox-layout">
                <GalleryLightboxMediaPane
                  gestureProps={gestureProps as Record<string, unknown>}
                  image={image}
                  activeItem={activeItem}
                  activeIsVideo={activeIsVideo}
                  mediaUrl={mediaUrl}
                  isSignedIn={isSignedIn}
                  isSequence={isSequence}
                  sequenceMedia={sequenceMedia}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  hasWallPrev={hasWallPrev}
                  hasWallNext={hasWallNext}
                  mediaLoaded={mediaLoaded}
                  setMediaLoaded={setMediaLoaded}
                  lightboxFailed={lightboxFailed}
                  setLightboxFailed={setLightboxFailed}
                  goLightboxPrev={goLightboxPrev}
                  goLightboxNext={goLightboxNext}
                  copyShareLink={() => void copyShareLink()}
                />
                <GalleryLightboxSocialAside
                  image={image}
                  activeItem={activeItem}
                  uploadedAt={uploadedAt}
                  isSequence={isSequence}
                  activeIndex={activeIndex}
                  sequenceLength={sequenceMedia.length}
                  isSignedIn={isSignedIn}
                  isAdmin={isAdmin}
                  viewerId={viewerId}
                  viewerName={viewerName}
                  members={members}
                  highlightCommentId={highlightCommentId}
                  mobileDetailsOpen={mobileDetailsOpen}
                  setMobileDetailsOpen={setMobileDetailsOpen}
                  pinnedAt={pinnedAt}
                  handlePinSuccess={handlePinSuccess}
                  wallCommentCount={wallCommentCount}
                  counts={counts}
                  myReaction={myReaction}
                  canReact={canReact}
                  onReact={onReact}
                  comments={comments}
                  setComments={setComments}
                />
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
              {wallCommentCount > 0
                ? `${wallCommentCount} comment${wallCommentCount === 1 ? "" : "s"}`
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
