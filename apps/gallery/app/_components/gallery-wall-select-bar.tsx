"use client"

import { useRef, useState, useTransition, type FormEvent } from "react"
import {
  IconAlbum,
  IconBookmark,
  IconCheckbox,
  IconDots,
  IconFileZip,
  IconLink,
  IconPlayerPlay,
  IconSquare,
  IconTag,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryAddToAlbum } from "@/app/_components/gallery-add-to-album"
import { AlbumSlideshow } from "@/app/albums/_components/album-slideshow"
import { setGalleryImagesPin } from "@/app/actions"
import {
  removeImagesFromGalleryAlbumBySlug,
  createGalleryAlbumWithImages,
} from "@/app/actions/albums"
import { setGalleryFavorites } from "@/app/actions/favorites"
import {
  attachGalleryTagToImages,
  detachGalleryTagFromImagesBySlug,
} from "@/app/actions/tags"
import { gallerySans } from "@/components/gallery-chrome"
import {
  describeBulkTagAttach,
  describeBulkTagDetach,
} from "@/lib/gallery/bulk-tag"
import { downloadAlbumZip } from "@/lib/gallery/download-album"
import type { GallerySlideshowPhoto } from "@/lib/gallery/slideshow"
import { shuffleSlideshowPhotos } from "@/lib/gallery/slideshow"
import { describeAlbumFromSelection } from "@/lib/gallery/album-from-selection"
import { describeWallAlbumPhotosRemoved } from "@/lib/gallery/wall-album-remove-toast"
import { describeWallSelectionCount } from "@/lib/gallery/wall-selection"
import {
  buildWallSelectionShareText,
  describeWallSelectionCopy,
} from "@/lib/gallery/wall-selection-share"
import { buildAlbumZipFilename } from "@/lib/gallery/zip-names"
import { describeZipDownloadResult } from "@/lib/gallery/zip-result"
import { describeZipPreparingProgress } from "@/lib/gallery/zip-progress"
import {
  describeCouldNotCopyClipboard,
  describeCouldNotCopyLinks,
} from "@/lib/gallery/validation-toasts"
import { describeCouldNotBuildZip } from "@/lib/gallery/download-labels"
import {
  describeCreatingLabel,
  describeTaggingLabel,
  describeWorkingLabel,
} from "@/lib/gallery/busy-labels"

export function GalleryWallSelectBar({
  selectionMode,
  selectedCount,
  allSelected,
  isSignedIn,
  isAdmin = false,
  pinAvailable = true,
  favoritesAvailable = true,
  albumsAvailable = true,
  tagsAvailable = true,
  selectedIds,
  selectedZipItems = [],
  selectedSlideshowPhotos = [],
  selectedStorySlideshowPhotos = [],
  savedFilterActive = false,
  albumFilterSlug = null,
  tagFilterSlug = null,
  onToggleMode,
  onToggleSelectAll,
  onClear,
  onAdded,
  onUnsaved,
  onPinned,
  onRemovedFromAlbum,
  onUntagged,
  onSlideshowOpenChange,
}: {
  selectionMode: boolean
  selectedCount: number
  allSelected: boolean
  isSignedIn: boolean
  isAdmin?: boolean
  pinAvailable?: boolean
  favoritesAvailable?: boolean
  albumsAvailable?: boolean
  tagsAvailable?: boolean
  selectedIds: string[]
  /** Ordered covers for ZIP download (name + storage path). */
  selectedZipItems?: Array<{
    name: string
    image_path: string
    position: number
  }>
  /** Selected wall covers for slideshow (wall order). */
  selectedSlideshowPhotos?: GallerySlideshowPhoto[]
  /** Selected covers expanded to sequence siblings for story playback. */
  selectedStorySlideshowPhotos?: GallerySlideshowPhoto[]
  /** When viewing ?saved=1, offer bulk Unsave. */
  savedFilterActive?: boolean
  /** When viewing ?album=, offer bulk Remove from that album. */
  albumFilterSlug?: string | null
  /** When viewing ?tag=, offer bulk Untag for that slug. */
  tagFilterSlug?: string | null
  onToggleMode: () => void
  onToggleSelectAll: () => void
  onClear: () => void
  onAdded?: () => void
  onUnsaved?: () => void
  onPinned?: (pinned: boolean) => void
  onRemovedFromAlbum?: () => void
  onUntagged?: () => void
  /** Suspend wall keyboard while the selection slideshow is open. */
  onSlideshowOpenChange?: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [saveOpenBusy, setSaveOpenBusy] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const copyLinksBusyRef = useRef(false)
  const [tagDraft, setTagDraft] = useState("")
  const [albumDraft, setAlbumDraft] = useState("")
  const [tagFormOpen, setTagFormOpen] = useState(false)
  const [albumFormOpen, setAlbumFormOpen] = useState(false)
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const [slideshowDeck, setSlideshowDeck] = useState<GallerySlideshowPhoto[]>(
    []
  )
  const [slideshowTitle, setSlideshowTitle] = useState("Wall selection")
  const slideshowButtonRef = useRef<HTMLButtonElement>(null)
  const moreActionsRef = useRef<HTMLButtonElement>(null)
  const [confirmKind, setConfirmKind] = useState<
    "album" | "tag" | "unsave" | null
  >(null)

  const handleSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    onSlideshowOpenChange?.(open)
    if (!open) {
      // Dialog stole focus — put keyboard users back on Play.
      queueMicrotask(() => slideshowButtonRef.current?.focus())
    }
  }

  const openSlideshow = (
    mode: "covers" | "shuffled" | "stories" = "covers"
  ) => {
    const source =
      mode === "stories"
        ? selectedStorySlideshowPhotos
        : selectedSlideshowPhotos
    if (source.length === 0) return
    setSlideshowDeck(
      mode === "shuffled" ? shuffleSlideshowPhotos(source) : source
    )
    setSlideshowTitle(
      mode === "shuffled"
        ? "Wall selection · shuffled"
        : mode === "stories"
          ? "Wall selection · stories"
          : "Wall selection"
    )
    handleSlideshowOpenChange(true)
  }

  const canSlideshow = selectedSlideshowPhotos.length > 0
  const canStorySlideshow = selectedStorySlideshowPhotos.length > 0
  const hasOverflowActions = isSignedIn || canSlideshow || canStorySlideshow
  const overflowBusy = pending || saveOpenBusy || selectedCount === 0

  const tagSelected = (event?: FormEvent) => {
    event?.preventDefault()
    const name = tagDraft.trim()
    if (!name || selectedIds.length === 0 || pending || saveOpenBusy) return
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await attachGalleryTagToImages(selectedIds, name)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        describeBulkTagAttach({
          tagName: result.data.tag.name,
          attached: result.data.attached,
          selected: selectedIds.length,
        })
      )
      setTagDraft("")
      setTagFormOpen(false)
      onClear()
    })
  }

  const pinSelected = (pinned: boolean) => {
    if (
      selectedIds.length === 0 ||
      pending ||
      saveOpenBusy ||
      !isAdmin ||
      !pinAvailable
    )
      return
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await setGalleryImagesPin(selectedIds, pinned)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.data.message)
      onPinned?.(pinned)
      onClear()
    })
  }

  const removeSelectedFromAlbum = () => {
    const slug = albumFilterSlug?.trim()
    if (
      !slug ||
      selectedIds.length === 0 ||
      pending ||
      saveOpenBusy ||
      !isSignedIn
    ) {
      return
    }
    setConfirmKind(null)
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await removeImagesFromGalleryAlbumBySlug(slug, selectedIds)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const n = result.data.removed
      toast.success(describeWallAlbumPhotosRemoved(n))
      onRemovedFromAlbum?.()
      onClear()
    })
  }

  const untagSelected = () => {
    const slug = tagFilterSlug?.trim()
    if (
      !slug ||
      selectedIds.length === 0 ||
      pending ||
      saveOpenBusy ||
      !isSignedIn
    ) {
      return
    }
    setConfirmKind(null)
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await detachGalleryTagFromImagesBySlug(selectedIds, slug)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const n = result.data.detached
      toast.success(
        describeBulkTagDetach({
          tagName: result.data.tagName,
          detached: n,
        })
      )
      onUntagged?.()
      onClear()
    })
  }

  const createAlbumFromSelection = (event?: FormEvent) => {
    event?.preventDefault()
    const title = albumDraft.trim()
    if (!title || selectedIds.length === 0 || pending || saveOpenBusy) return
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await createGalleryAlbumWithImages({
        title,
        imageIds: selectedIds,
      })
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { title: albumTitle, slug, added } = result.data
      toast.success(describeAlbumFromSelection({ title: albumTitle, added }), {
        description: `/albums/${slug}`,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = `/albums/${slug}`
          },
        },
      })
      setAlbumDraft("")
      setAlbumFormOpen(false)
      onClear()
    })
  }

  const saveSelected = () => {
    if (
      !favoritesAvailable ||
      selectedIds.length === 0 ||
      pending ||
      saveOpenBusy
    )
      return
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await setGalleryFavorites(selectedIds, true)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      onClear()
    })
  }

  const unsaveSelected = () => {
    if (
      !favoritesAvailable ||
      selectedIds.length === 0 ||
      pending ||
      saveOpenBusy
    )
      return
    setSaveOpenBusy(true)
    startTransition(async () => {
      const result = await setGalleryFavorites(selectedIds, false)
      setSaveOpenBusy(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      onUnsaved?.()
      onClear()
    })
  }

  const downloadSelectedZip = async () => {
    if (zipBusy || selectedZipItems.length === 0) return
    setZipBusy(true)
    const toastId = toast.loading(
      describeZipPreparingProgress({
        completed: 0,
        total: selectedZipItems.length,
        noun: "selection",
      })
    )
    try {
      const result = await downloadAlbumZip(selectedZipItems, {
        zipName: buildAlbumZipFilename("wall-selection"),
        onProgress: ({ completed, total }) => {
          toast.loading(
            describeZipPreparingProgress({
              completed,
              total,
              noun: "selection",
            }),
            {
              id: toastId,
            }
          )
        },
      })
      const copy = describeZipDownloadResult({
        count: result.count,
        failed: result.failed,
        noun: "photo",
      })
      if (copy.severity === "warning") {
        toast.warning(copy.title, {
          id: toastId,
          description: copy.description,
        })
      } else {
        toast.success(copy.title, { id: toastId })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : describeCouldNotBuildZip()
      toast.error(message, { id: toastId })
    } finally {
      setZipBusy(false)
    }
  }

  const copySelectedLinks = async () => {
    if (selectedIds.length === 0 || copyLinksBusyRef.current) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    if (!origin) {
      toast.error(describeCouldNotCopyLinks())
      return
    }
    copyLinksBusyRef.current = true
    const text = buildWallSelectionShareText(selectedIds, origin)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(describeWallSelectionCopy(selectedIds.length))
    } catch {
      toast.error(describeCouldNotCopyClipboard())
    } finally {
      copyLinksBusyRef.current = false
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggleMode}
        aria-pressed={selectionMode}
        className={cn(
          gallerySans(),
          "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] tracking-wide uppercase shadow-sm backdrop-blur-sm transition-colors",
          "hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
          selectionMode && "border-foreground/25 bg-foreground/[0.06]",
          "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        )}
      >
        {selectionMode ? (
          <IconX className="size-3.5" aria-hidden />
        ) : (
          <IconCheckbox className="size-3.5" aria-hidden />
        )}
        {selectionMode ? "Cancel select" : "Select"}
      </button>

      {selectionMode ? (
        <button
          type="button"
          onClick={onToggleSelectAll}
          aria-pressed={allSelected}
          aria-label={
            allSelected ? "Clear all selected photos" : "Select all photos"
          }
          className={cn(
            gallerySans(),
            "inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] tracking-wide uppercase shadow-sm backdrop-blur-sm transition-colors",
            "hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          )}
        >
          <IconSquare className="size-3.5" aria-hidden />
          {allSelected ? "Clear all" : "Select all"}
        </button>
      ) : null}

      {selectionMode ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(100%,48rem)] flex-wrap items-center justify-between gap-3 px-4",
            "sm:px-6"
          )}
        >
          <div
            className={cn(
              "flex w-full flex-wrap items-center gap-3 rounded-xl border border-zinc-900/15 bg-card/95 px-4 py-3 shadow-[0_12px_40px_-16px_rgba(24,24,27,0.45)] backdrop-blur-md"
            )}
            role="status"
            aria-live="polite"
          >
            <p
              className={cn(gallerySans(), "shrink-0 text-sm text-foreground")}
            >
              {describeWallSelectionCount(selectedCount)}
            </p>
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto",
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              )}
            >
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(gallerySans(), "h-8 text-[11px] uppercase")}
                  onClick={onClear}
                  disabled={selectedCount === 0}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedZipItems.length === 0 || zipBusy}
                  aria-busy={zipBusy || undefined}
                  className={cn(
                    gallerySans(),
                    "h-8 gap-1.5 text-[11px] uppercase"
                  )}
                  onClick={() => void downloadSelectedZip()}
                >
                  <IconFileZip className="size-3.5" aria-hidden />
                  {selectedZipItems.length > 0
                    ? `ZIP ${selectedZipItems.length}`
                    : "ZIP"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0}
                  className={cn(
                    gallerySans(),
                    "h-8 gap-1.5 text-[11px] uppercase"
                  )}
                  onClick={() => void copySelectedLinks()}
                >
                  <IconLink className="size-3.5" aria-hidden />
                  Links
                </Button>
                <Button
                  ref={slideshowButtonRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSlideshow || slideshowOpen}
                  aria-busy={slideshowOpen || undefined}
                  className={cn(
                    gallerySans(),
                    "h-8 gap-1.5 text-[11px] uppercase"
                  )}
                  onClick={() => openSlideshow("covers")}
                >
                  <IconPlayerPlay className="size-3.5" aria-hidden />
                  Play
                </Button>
                {isSignedIn ? (
                  <>
                    {favoritesAvailable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selectedCount === 0 || pending}
                        className={cn(
                          gallerySans(),
                          "h-8 gap-1.5 text-[11px] uppercase"
                        )}
                        onClick={saveSelected}
                      >
                        <IconBookmark className="size-3.5" aria-hidden />
                        {selectedCount > 0 ? `Save ${selectedCount}` : "Save"}
                      </Button>
                    ) : null}
                    {albumsAvailable ? (
                      <GalleryAddToAlbum
                        imageIds={selectedIds}
                        triggerLabel={
                          selectedCount > 0
                            ? `Add ${selectedCount}`
                            : "Add to album"
                        }
                        onAdded={() => {
                          onAdded?.()
                          onClear()
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      gallerySans(),
                      "h-8 gap-1.5 text-[11px] uppercase"
                    )}
                    disabled
                    title="Sign in to curate"
                  >
                    <IconAlbum className="size-3.5" aria-hidden />
                    Sign in to curate
                  </Button>
                )}
              </div>

              {tagFormOpen && tagsAvailable ? (
                <form
                  onSubmit={tagSelected}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="Tag…"
                    aria-label="Tag to apply to selection"
                    disabled={selectedCount === 0 || pending}
                    autoFocus
                    className={cn(
                      gallerySans(),
                      "h-8 w-[7.5rem] text-[11px] sm:w-28"
                    )}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={
                      selectedCount === 0 || pending || !tagDraft.trim()
                    }
                    aria-busy={pending || undefined}
                    className={cn(
                      gallerySans(),
                      "h-8 gap-1.5 text-[11px] uppercase"
                    )}
                  >
                    <IconTag className="size-3.5" aria-hidden />
                    {pending ? describeTaggingLabel() : "Tag"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(gallerySans(), "h-8 text-[11px] uppercase")}
                    onClick={() => {
                      setTagFormOpen(false)
                      setTagDraft("")
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : null}

              {albumFormOpen && albumsAvailable ? (
                <form
                  onSubmit={createAlbumFromSelection}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <Input
                    value={albumDraft}
                    onChange={(e) => setAlbumDraft(e.target.value)}
                    placeholder="Album title…"
                    aria-label="New album title"
                    disabled={selectedCount === 0 || pending}
                    autoFocus
                    className={cn(
                      gallerySans(),
                      "h-8 w-[8.5rem] text-[11px] sm:w-36"
                    )}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={
                      selectedCount === 0 || pending || !albumDraft.trim()
                    }
                    aria-busy={pending || undefined}
                    className={cn(gallerySans(), "h-8 text-[11px] uppercase")}
                  >
                    {pending ? describeCreatingLabel() : "Create"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(gallerySans(), "h-8 text-[11px] uppercase")}
                    onClick={() => {
                      setAlbumFormOpen(false)
                      setAlbumDraft("")
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : null}

              {hasOverflowActions && !tagFormOpen && !albumFormOpen ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      ref={moreActionsRef}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={selectedCount === 0}
                      className={cn(
                        gallerySans(),
                        "h-8 shrink-0 gap-1.5 text-[11px] uppercase"
                      )}
                      aria-label="More selection actions"
                    >
                      <IconDots className="size-3.5" aria-hidden />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    {canSlideshow ? (
                      <DropdownMenuItem
                        disabled={!canSlideshow}
                        onSelect={() => openSlideshow("shuffled")}
                      >
                        Play shuffled
                      </DropdownMenuItem>
                    ) : null}
                    {canStorySlideshow &&
                    selectedStorySlideshowPhotos.length !==
                      selectedSlideshowPhotos.length ? (
                      <DropdownMenuItem
                        disabled={!canStorySlideshow}
                        onSelect={() => openSlideshow("stories")}
                      >
                        Play with stories
                      </DropdownMenuItem>
                    ) : null}
                    {isSignedIn ? (
                      <>
                        {tagsAvailable ? (
                          <DropdownMenuItem
                            disabled={overflowBusy}
                            onSelect={() => {
                              setAlbumFormOpen(false)
                              setTagFormOpen(true)
                            }}
                          >
                            Tag…
                          </DropdownMenuItem>
                        ) : null}
                        {albumsAvailable ? (
                          <DropdownMenuItem
                            disabled={overflowBusy}
                            onSelect={() => {
                              setTagFormOpen(false)
                              setAlbumFormOpen(true)
                            }}
                          >
                            New album…
                          </DropdownMenuItem>
                        ) : null}
                        {savedFilterActive && favoritesAvailable ? (
                          <DropdownMenuItem
                            disabled={overflowBusy}
                            onSelect={() => setConfirmKind("unsave")}
                          >
                            Unsave
                          </DropdownMenuItem>
                        ) : null}
                        {albumFilterSlug && albumsAvailable ? (
                          <DropdownMenuItem
                            disabled={overflowBusy}
                            onSelect={() => setConfirmKind("album")}
                          >
                            Remove from album
                          </DropdownMenuItem>
                        ) : null}
                        {tagFilterSlug && tagsAvailable ? (
                          <DropdownMenuItem
                            disabled={overflowBusy}
                            onSelect={() => setConfirmKind("tag")}
                          >
                            Untag
                          </DropdownMenuItem>
                        ) : null}
                        {isAdmin && pinAvailable ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={overflowBusy}
                              onSelect={() => pinSelected(true)}
                            >
                              Pin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={overflowBusy}
                              onSelect={() => pinSelected(false)}
                            >
                              Unpin
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <AlbumSlideshow
        photos={slideshowDeck}
        albumTitle={slideshowTitle}
        open={slideshowOpen}
        onOpenChange={handleSlideshowOpenChange}
        startIndex={0}
      />

      <AlertDialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKind(null)
            queueMicrotask(() => moreActionsRef.current?.focus())
          }
        }}
      >
        <AlertDialogContent aria-busy={overflowBusy || undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind === "tag"
                ? `Untag ${selectedCount} selected photo${selectedCount === 1 ? "" : "s"}?`
                : confirmKind === "unsave"
                  ? `Unsave ${selectedCount} selected photo${selectedCount === 1 ? "" : "s"}?`
                  : `Remove ${selectedCount} photo${selectedCount === 1 ? "" : "s"} from this album?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "tag"
                ? "Detaches the active tag filter from the selection. Photos stay on the wall."
                : confirmKind === "unsave"
                  ? "Removes the selection from your Saved list. Photos stay on the wall."
                  : "Removes the selection from this album only. Photos stay on the wall."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={overflowBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={overflowBusy}
              aria-busy={overflowBusy || undefined}
              onClick={() => {
                if (confirmKind === "tag") untagSelected()
                else if (confirmKind === "unsave") unsaveSelected()
                else removeSelectedFromAlbum()
              }}
            >
              {overflowBusy
                ? describeWorkingLabel()
                : confirmKind === "tag"
                  ? "Untag"
                  : confirmKind === "unsave"
                    ? "Unsave"
                    : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
