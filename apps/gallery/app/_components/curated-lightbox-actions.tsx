"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconLink } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { toggleGalleryFavorite } from "@/app/actions/favorites"
import { DownloadOriginalButton } from "@/app/_components/download-original-button"
import { FavoritePhotoButton } from "@/app/_components/favorite-photo-button"
import { gallerySans } from "@/components/gallery-chrome"
import {
  describeCouldNotDownload,
  describeSignInToFavorite,
} from "@/lib/gallery/download-labels"
import { downloadGalleryOriginal } from "@/lib/gallery/download-original"
import { describeErrorMessage } from "@/lib/gallery/error-message"
import { describeFavoriteToast } from "@/lib/gallery/favorite-toast"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { describeLightboxShareAriaLabel } from "@/lib/gallery/lightbox-labels"
import { resolveLightboxShortcut } from "@/lib/gallery/lightbox-shortcuts"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
import { shareOrCopyPhotoLink } from "@/lib/gallery/photo-share"
import {
  describePhotoLinkCopied,
  describeSavedOriginal,
} from "@/lib/gallery/photo-share-toast"

type CuratedLightboxActionsProps = {
  open: boolean
  photoId: string
  name: string
  imagePath: string
  signedIn: boolean
  initialFavorited?: boolean
  className?: string
}

/** Favorite / download / share + F/D/S for album & Memories lightboxes. */
export function CuratedLightboxActions({
  open,
  photoId,
  name,
  imagePath,
  signedIn,
  initialFavorited = false,
  className,
}: CuratedLightboxActionsProps) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const favoriteBusyRef = useRef(false)
  const shareBusyRef = useRef(false)
  const downloadBusyRef = useRef(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)

  useEffect(() => {
    setFavorited(initialFavorited)
  }, [photoId, initialFavorited])

  const copyShareLink = useCallback(async () => {
    if (shareBusyRef.current) return
    shareBusyRef.current = true
    setShareBusy(true)
    try {
      const href = buildGalleryPhotoHref({ photoId })
      const url = `${window.location.origin}${href}`
      const result = await shareOrCopyPhotoLink({ url, title: name })
      if (!result.ok) {
        if (result.reason === "aborted") return
        toast.error(result.message)
        return
      }
      if (result.mode === "copied") toast.success(describePhotoLinkCopied())
    } finally {
      shareBusyRef.current = false
      setShareBusy(false)
    }
  }, [name, photoId])

  const toggleFavoriteFromKeyboard = useCallback(async () => {
    if (!signedIn) {
      toast.error(describeSignInToFavorite())
      return
    }
    if (favoriteBusyRef.current) return
    favoriteBusyRef.current = true
    const next = !favorited
    setFavorited(next)
    try {
      const result = await toggleGalleryFavorite(photoId, next)
      if (!result.ok) {
        setFavorited(!next)
        toast.error(result.error)
        return
      }
      toast.success(describeFavoriteToast(result.favorited))
    } finally {
      favoriteBusyRef.current = false
    }
  }, [favorited, photoId, signedIn])

  const downloadOriginalFromKeyboard = useCallback(async () => {
    if (downloadBusyRef.current) return
    if (!imagePath.trim()) {
      toast.error(describeCouldNotDownload())
      return
    }
    downloadBusyRef.current = true
    setDownloadBusy(true)
    try {
      await downloadGalleryOriginal({ displayName: name, imagePath })
      toast.success(describeSavedOriginal())
    } catch (error) {
      toast.error(describeErrorMessage(error, describeCouldNotDownload()))
    } finally {
      downloadBusyRef.current = false
      setDownloadBusy(false)
    }
  }, [imagePath, name])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const action = resolveLightboxShortcut(event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
      if (
        action !== "share" &&
        action !== "favorite" &&
        action !== "download"
      ) {
        return
      }
      event.preventDefault()
      if (action === "share") {
        void copyShareLink()
        return
      }
      if (action === "favorite") {
        void toggleFavoriteFromKeyboard()
        return
      }
      void downloadOriginalFromKeyboard()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    copyShareLink,
    downloadOriginalFromKeyboard,
    open,
    toggleFavoriteFromKeyboard,
  ])

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        gallerySans(),
        className
      )}
    >
      {signedIn ? (
        <FavoritePhotoButton
          imageId={photoId}
          initialFavorited={favorited}
          onChanged={setFavorited}
        />
      ) : null}
      <DownloadOriginalButton
        displayName={name}
        imagePath={imagePath}
        disabled={downloadBusy}
      />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {downloadBusy ? "Downloading original…" : ""}
      </span>
      <button
        type="button"
        onClick={() => {
          void copyShareLink()
        }}
        disabled={shareBusy}
        aria-busy={shareBusy || undefined}
        aria-label={describeLightboxShareAriaLabel()}
        className={cn(
          gallerySans(),
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs",
          "hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        )}
      >
        <IconLink className="size-3.5" aria-hidden />
        Share
      </button>
    </div>
  )
}
