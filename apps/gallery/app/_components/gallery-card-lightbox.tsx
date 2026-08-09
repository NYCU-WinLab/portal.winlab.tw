"use client"

import type { Dispatch, SetStateAction } from "react"

import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconDownload,
  IconLink,
  IconPin,
  IconX,
} from "@tabler/icons-react"

import { DialogClose } from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

import { ReactionBar } from "@/app/_components/reaction-bar"
import { GalleryComments } from "@/app/_components/gallery-comments"
import { PinWallButton } from "@/app/_components/pin-wall-button"
import { UploaderFilterLink } from "@/app/_components/uploader-filter-link"
import {
  posterUrlFromItem,
  thumbUrlFromItem,
} from "@/app/_components/gallery-card-media"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import { formatUploadedAt } from "@/lib/gallery/format-uploaded-at"
import type { GalleryReaction, ReactionCounts } from "@/lib/gallery/reactions"
import type {
  GalleryComment,
  GalleryImage,
  GalleryMember,
  GallerySequenceItem,
} from "@/lib/gallery/types"

/** Lightbox media plane: image/video, chrome buttons, sequence dots. */
export function GalleryLightboxMediaPane({
  gestureProps,
  image,
  activeItem,
  activeIsVideo,
  mediaUrl,
  isSignedIn,
  isSequence,
  sequenceMedia,
  activeIndex,
  setActiveIndex,
  hasWallPrev,
  hasWallNext,
  mediaLoaded,
  setMediaLoaded,
  lightboxFailed,
  setLightboxFailed,
  goLightboxPrev,
  goLightboxNext,
  copyShareLink,
}: {
  gestureProps: Record<string, unknown>
  image: GalleryImage
  activeItem: GallerySequenceItem | undefined
  activeIsVideo: boolean
  mediaUrl: string
  isSignedIn: boolean
  isSequence: boolean
  sequenceMedia: GallerySequenceItem[]
  activeIndex: number
  setActiveIndex: Dispatch<SetStateAction<number>>
  hasWallPrev: boolean
  hasWallNext: boolean
  mediaLoaded: boolean
  setMediaLoaded: (v: boolean) => void
  lightboxFailed: boolean
  setLightboxFailed: (v: boolean) => void
  goLightboxPrev: () => void
  goLightboxNext: () => void
  copyShareLink: () => void
}) {
  return (
    <div {...gestureProps} className="gallery-lightbox-media relative">
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
      <button
        type="button"
        onClick={() => void copyShareLink()}
        aria-label="Share"
        className={cn(
          "absolute top-[max(env(safe-area-inset-top),0.75rem)] z-20",
          isSignedIn
            ? "right-[calc(max(env(safe-area-inset-right),0.75rem)+6rem)]"
            : "right-[calc(max(env(safe-area-inset-right),0.75rem)+3rem)]",
          "inline-flex h-11 w-11 items-center justify-center rounded-full",
          "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
          "transition-colors hover:bg-white",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        )}
      >
        <IconLink className="h-5 w-5" />
      </button>
      {isSignedIn ? (
        <a
          href={mediaUrl}
          download
          aria-label="Save original"
          className={cn(
            "absolute top-[max(env(safe-area-inset-top),0.75rem)] right-[calc(max(env(safe-area-inset-right),0.75rem)+3rem)] z-20",
            "inline-flex h-11 w-11 items-center justify-center rounded-full",
            "bg-white/85 text-foreground shadow-lg backdrop-blur-sm",
            "transition-colors hover:bg-white",
            "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          )}
        >
          <IconDownload className="h-5 w-5" />
        </a>
      ) : null}
      {!mediaLoaded && !lightboxFailed ? (
        <div
          aria-hidden
          className="gallery-lightbox-image min-h-[40dvh] w-[min(92vw,28rem)] animate-pulse rounded-sm bg-zinc-700/40 sm:min-h-[50dvh]"
        />
      ) : null}
      {lightboxFailed ? (
        <div className="max-w-[95vw] rounded-sm bg-muted px-8 py-16 text-center text-muted-foreground italic shadow-2xl">
          This {activeIsVideo ? "video" : "image"} cannot be previewed in your
          browser.
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
          muted
          playsInline
          preload="metadata"
          className={cn("gallery-lightbox-image", !mediaLoaded && "opacity-0")}
          onLoadedData={(event) => {
            setMediaLoaded(true)
            const video = event.currentTarget
            video.muted = false
          }}
          onError={() => setLightboxFailed(true)}
        />
      ) : (
        <img
          src={mediaUrl}
          alt={activeItem?.name ?? image.name}
          className={cn("gallery-lightbox-image", !mediaLoaded && "opacity-0")}
          onLoad={() => setMediaLoaded(true)}
          onError={() => setLightboxFailed(true)}
        />
      )}
      {hasWallPrev || isSequence ? (
        <button
          type="button"
          onClick={goLightboxPrev}
          className="absolute top-1/2 left-2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:left-3 sm:h-10 sm:w-10"
          aria-label="Previous"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {hasWallNext || isSequence ? (
        <button
          type="button"
          onClick={goLightboxNext}
          className="absolute top-1/2 right-2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:right-3 sm:h-10 sm:w-10"
          aria-label="Next"
        >
          <IconChevronRight className="h-5 w-5" />
        </button>
      ) : null}
      {isSequence ? (
        <div className="absolute right-0 bottom-3 left-0 z-10 mx-auto flex w-full max-w-2xl items-end justify-center gap-1.5 overflow-x-auto px-4 pb-0.5">
          {sequenceMedia.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`View shot ${idx + 1}`}
              aria-current={idx === activeIndex ? "true" : undefined}
              className={cn(
                "relative h-11 w-9 shrink-0 overflow-hidden rounded-[2px] border-2 bg-zinc-900/30 shadow-md transition-[transform,opacity]",
                idx === activeIndex
                  ? "scale-105 border-white"
                  : "border-white/35 opacity-75 hover:opacity-100"
              )}
            >
              {/* Tiny strip thumbs — next/image is overkill in lightbox chrome */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrlFromItem(item)}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Lightbox aside: meta, pin, reactions, comments. */
export function GalleryLightboxSocialAside({
  image,
  activeItem,
  uploadedAt,
  isSequence,
  activeIndex,
  sequenceLength,
  isSignedIn,
  isAdmin,
  viewerId,
  viewerName,
  members,
  highlightCommentId,
  mobileDetailsOpen,
  setMobileDetailsOpen,
  pinnedAt,
  handlePinSuccess,
  wallCommentCount,
  counts,
  myReaction,
  canReact,
  onReact,
  comments,
  setComments,
}: {
  image: GalleryImage
  activeItem: GallerySequenceItem | undefined
  uploadedAt: string
  isSequence: boolean
  activeIndex: number
  sequenceLength: number
  isSignedIn: boolean
  isAdmin: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  highlightCommentId?: string | null
  mobileDetailsOpen: boolean
  setMobileDetailsOpen: Dispatch<SetStateAction<boolean>>
  pinnedAt: string | null
  handlePinSuccess: (next: string | null) => void
  wallCommentCount: number
  counts: ReactionCounts
  myReaction: GalleryReaction | null
  canReact: boolean
  onReact: (reaction: GalleryReaction) => void
  comments: GalleryComment[]
  setComments: Dispatch<SetStateAction<GalleryComment[]>>
}) {
  return (
    <aside
      className={cn(
        "gallery-lightbox-aside",
        mobileDetailsOpen && "gallery-lightbox-aside--expanded"
      )}
    >
      <div className="gallery-lightbox-aside-toggle md:hidden">
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border/80"
        />
        <div className="flex w-full items-center gap-2 px-4 pt-2 pb-3">
          <button
            type="button"
            className="min-w-0 flex-1 bg-transparent text-left"
            aria-expanded={mobileDetailsOpen}
            onClick={() => setMobileDetailsOpen((open) => !open)}
          >
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
              {mobileDetailsOpen
                ? "Swipe down or tap to hide"
                : wallCommentCount > 0
                  ? `${wallCommentCount} comment${wallCommentCount === 1 ? "" : "s"} · tap or swipe up`
                  : "Comments & reactions · tap or swipe up"}
            </span>
          </button>
          {isAdmin ? (
            <PinWallButton
              imageId={image.id}
              pinnedAt={pinnedAt}
              onPinnedChange={handlePinSuccess}
              scrollToWallTop
              className="shrink-0"
            />
          ) : null}
          <button
            type="button"
            aria-label={
              mobileDetailsOpen ? "Collapse comments" : "Expand comments"
            }
            aria-expanded={mobileDetailsOpen}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            onClick={() => setMobileDetailsOpen((open) => !open)}
          >
            <IconChevronUp
              className={cn(
                "h-4 w-4 transition-transform",
                mobileDetailsOpen && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>
      <div className="gallery-lightbox-aside-header space-y-4 border-b border-border/45 px-5 py-5 sm:px-6">
        <p
          className={cn(
            gallerySans(),
            "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
          )}
        >
          On the wall
        </p>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={cn(
                gallerySerif(),
                "text-2xl leading-none tracking-tight text-foreground sm:text-[1.75rem]"
              )}
            >
              {activeItem?.name ?? image.name}
            </h2>
            {pinnedAt ? (
              <span
                className={cn(
                  gallerySans(),
                  "inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                )}
              >
                <IconPin className="size-3" aria-hidden />
                Pinned
              </span>
            ) : null}
          </div>
          <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            by{" "}
            {image.created_by && isSignedIn ? (
              <UploaderFilterLink uploaderId={image.created_by}>
                {image.uploader_name}
              </UploaderFilterLink>
            ) : (
              image.uploader_name
            )}
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
              Shot {activeIndex + 1} of {sequenceLength}
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <div className="flex justify-end">
            <PinWallButton
              imageId={image.id}
              pinnedAt={pinnedAt}
              onPinnedChange={handlePinSuccess}
              scrollToWallTop
            />
          </div>
        ) : null}
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
          isAdmin={isAdmin}
          highlightCommentId={highlightCommentId}
        />
      </div>
    </aside>
  )
}
