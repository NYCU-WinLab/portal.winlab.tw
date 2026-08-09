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
import { GalleryTitleEditor } from "@/app/_components/gallery-title-editor"
import {
  galleryPillClass,
  galleryPolaroidClass,
  gallerySans,
} from "@/components/gallery-chrome"
import { useLightboxGestures } from "@/hooks/use-lightbox-gestures"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { describeSequenceGaps } from "@/lib/gallery/manage-uploads"
import { getPolaroidFrame, getPolaroidTape } from "@/lib/gallery/polaroid-frame"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import type { ArtworkNamePatch } from "@/lib/gallery/rename-artwork"
import {
  nextSequenceIndex,
  resolveLightboxNextStep,
  resolveLightboxPrevStep,
} from "@/lib/gallery/lightbox-nav"
import { resolveLightboxShortcut } from "@/lib/gallery/lightbox-shortcuts"
import { downloadGalleryOriginal } from "@/lib/gallery/download-original"
import { getRotation } from "@/lib/gallery/rotation"
import { toggleGalleryFavorite } from "@/app/actions/favorites"
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
  pinAvailable = true,
  favoritesAvailable = true,
  albumsAvailable = true,
  tagsAvailable = true,
  reactionsAvailable = true,
  commentsAvailable = true,
  priorityLcp = false,
  initialOpen = false,
  highlightCommentId = null,
  open,
  onOpenChange,
  gridFocused = false,
  hasWallPrev = false,
  hasWallNext = false,
  onWallNavigate,
  onArtworkRenamed,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: {
  image: GalleryImage
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin?: boolean
  pinAvailable?: boolean
  favoritesAvailable?: boolean
  albumsAvailable?: boolean
  tagsAvailable?: boolean
  reactionsAvailable?: boolean
  commentsAvailable?: boolean
  priorityLcp?: boolean
  initialOpen?: boolean
  highlightCommentId?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  gridFocused?: boolean
  hasWallPrev?: boolean
  hasWallNext?: boolean
  onWallNavigate?: (direction: "prev" | "next") => void
  onArtworkRenamed?: (patches: ArtworkNamePatch[]) => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelected?: (imageId: string, options?: { shiftKey?: boolean }) => void
}) {
  const isOwner = Boolean(viewerId && image.created_by === viewerId)
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
            tags: image.tags ?? [],
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
    commentPinAvailable,
    commentLikesAvailable,
    reactionsAvailable: lightboxReactionsAvailable,
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
    onSwipeDown: () => setMobileDetailsOpen(false),
  })

  const [favorited, setFavorited] = useState(Boolean(image.is_favorited))

  useEffect(() => {
    setFavorited(Boolean(image.is_favorited))
  }, [image.id, image.is_favorited])

  const copyShareLink = useCallback(async () => {
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
  }, [activeItem?.name, highlightCommentId, image.id, image.name])

  const toggleFavoriteFromKeyboard = useCallback(async () => {
    if (!isSignedIn) {
      toast.error("Sign in to save favorites.")
      return
    }
    const next = !favorited
    setFavorited(next)
    const result = await toggleGalleryFavorite(image.id, next)
    if (!result.ok) {
      setFavorited(!next)
      toast.error(result.error)
      return
    }
    toast.success(
      result.favorited ? "Saved to favorites" : "Removed from favorites"
    )
  }, [favorited, image.id, isSignedIn])

  const downloadOriginalFromKeyboard = useCallback(async () => {
    const path = activeItem?.image_path ?? image.image_path
    const name = activeItem?.name ?? image.name
    if (!path) {
      toast.error("Nothing to download.")
      return
    }
    try {
      await downloadGalleryOriginal({ displayName: name, imagePath: path })
      toast.success("Saved original")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not download"
      toast.error(message)
    }
  }, [activeItem?.image_path, activeItem?.name, image.image_path, image.name])

  useEffect(() => {
    if (!isDialogOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const action = resolveLightboxShortcut(event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
      if (!action) return
      event.preventDefault()
      if (action === "prev") {
        goLightboxPrev()
        return
      }
      if (action === "next") {
        goLightboxNext()
        return
      }
      if (action === "first") {
        setActiveIndex(0)
        return
      }
      if (action === "last") {
        setActiveIndex(Math.max(0, sequenceMedia.length - 1))
        return
      }
      if (action === "toggle-details") {
        setMobileDetailsOpen((open) => !open)
        return
      }
      if (action === "share") {
        void copyShareLink()
        return
      }
      if (action === "favorite") {
        void toggleFavoriteFromKeyboard()
        return
      }
      if (action === "download") {
        void downloadOriginalFromKeyboard()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    copyShareLink,
    downloadOriginalFromKeyboard,
    goLightboxNext,
    goLightboxPrev,
    isDialogOpen,
    sequenceMedia.length,
    toggleFavoriteFromKeyboard,
  ])

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

  return (
    <figure
      className={cn(
        "mx-auto w-full sm:max-w-none",
        frame.maxWidthClass,
        gridFocused &&
          "rounded-sm ring-2 ring-ring ring-offset-2 ring-offset-background",
        selectionMode &&
          selected &&
          "rounded-sm ring-2 ring-foreground/40 ring-offset-2 ring-offset-background"
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
          <Dialog
            open={selectionMode ? false : isDialogOpen}
            onOpenChange={selectionMode ? undefined : handleDialogOpenChange}
          >
            <div
              className={cn(
                galleryPolaroidClass(),
                tape === "tl" &&
                  "gallery-polaroid-tape gallery-polaroid-tape--tl",
                tape === "tr" &&
                  "gallery-polaroid-tape gallery-polaroid-tape--tr",
                tape === "clip" && "gallery-polaroid-clip",
                selectionMode && selected && "ring-2 ring-foreground/30"
              )}
            >
              {selectionMode ? (
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={
                    selected
                      ? `Deselect ${activeItem?.name ?? image.name}`
                      : `Select ${activeItem?.name ?? image.name}`
                  }
                  onClick={(event) =>
                    onToggleSelected?.(image.id, { shiftKey: event.shiftKey })
                  }
                  className="relative block w-full rounded-[1px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {thumbFailed ? (
                    <div
                      className={cn(
                        "mx-2.5 mt-2.5 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-neutral-200/80 to-neutral-300/70 px-4 text-center shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]",
                        frame.aspectClass
                      )}
                    >
                      <Image
                        src="/icons/mark.png"
                        alt=""
                        width={40}
                        height={40}
                        className="size-9 object-contain opacity-40 grayscale"
                        draggable={false}
                        unoptimized
                      />
                      <span
                        className={cn(
                          gallerySans(),
                          "text-[11px] tracking-wide text-zinc-500/90"
                        )}
                      >
                        Preview unavailable
                      </span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative mx-2.5 mt-2.5 overflow-hidden bg-neutral-200/80 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]",
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
                        decoding="async"
                        onError={() => setThumbFailed(true)}
                      />
                      {activeIsVideo ? <PlayBadge /> : null}
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute top-4 left-4 flex size-6 items-center justify-center rounded-md border text-[11px] shadow-sm backdrop-blur-sm",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/80 bg-background/85 text-muted-foreground"
                    )}
                    aria-hidden
                  >
                    {selected ? "✓" : ""}
                  </span>
                </button>
              ) : (
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="block w-full rounded-[1px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {thumbFailed ? (
                      <div
                        className={cn(
                          "mx-2.5 mt-2.5 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-neutral-200/80 to-neutral-300/70 px-4 text-center shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]",
                          frame.aspectClass
                        )}
                      >
                        <Image
                          src="/icons/mark.png"
                          alt=""
                          width={40}
                          height={40}
                          className="size-9 object-contain opacity-40 grayscale"
                          draggable={false}
                          unoptimized
                        />
                        <span
                          className={cn(
                            gallerySans(),
                            "text-[11px] tracking-wide text-zinc-500/90"
                          )}
                        >
                          Preview unavailable
                        </span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "relative mx-2.5 mt-2.5 overflow-hidden bg-neutral-200/80 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]",
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
                          decoding="async"
                          onError={() => setThumbFailed(true)}
                        />
                        {activeIsVideo ? <PlayBadge /> : null}
                        {pinnedAt ? (
                          <div
                            className={cn(
                              gallerySans(),
                              "absolute top-2.5 left-2.5 inline-flex items-center gap-0.5 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm"
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
                              "absolute top-2.5 right-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm"
                            )}
                          >
                            {sequenceGapLabel
                              ? `Incomplete · ${image.sequence_count}`
                              : `${image.sequence_count} shots`}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </button>
                </DialogTrigger>
              )}
              {/* Caption sits outside DialogTrigger so owner edit controls are not nested buttons. */}
              <div className="gallery-polaroid-caption px-3 pt-3.5 pb-5">
                <GalleryTitleEditor
                  imageId={image.id}
                  name={image.name}
                  canEdit={isOwner && !selectionMode}
                  variant="polaroid"
                  onRenamed={onArtworkRenamed}
                />
              </div>
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
                  sequenceMedia={sequenceMedia}
                  isSignedIn={isSignedIn}
                  isAdmin={isAdmin}
                  pinAvailable={pinAvailable}
                  favoritesAvailable={favoritesAvailable}
                  albumsAvailable={albumsAvailable}
                  tagsAvailable={tagsAvailable}
                  isOwner={isOwner}
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
                  onArtworkRenamed={onArtworkRenamed}
                  favorited={favorited}
                  onFavoritedChange={setFavorited}
                  commentPinAvailable={commentPinAvailable}
                  commentLikesAvailable={commentLikesAvailable}
                  reactionsAvailable={lightboxReactionsAvailable}
                  commentsAvailable={commentsAvailable}
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
            reactionsAvailable && reactionTotal > 0
              ? "justify-between"
              : "justify-end"
          )}
        >
          {reactionsAvailable ? (
            <ReactionSummary
              total={reactionTotal}
              counts={counts}
              namesByReaction={namesByReaction}
            />
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            {commentsAvailable ? (
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
            ) : null}
            {reactionsAvailable ? (
              <ReactionBar
                counts={counts}
                myReaction={myReaction}
                canReact={canReact}
                onReact={onReact}
              />
            ) : null}
          </div>
        </div>
      </figcaption>
    </figure>
  )
}
