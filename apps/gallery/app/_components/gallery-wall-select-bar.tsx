"use client"

import { useState, useTransition, type FormEvent } from "react"
import {
  IconAlbum,
  IconBookmark,
  IconCheckbox,
  IconFileZip,
  IconLink,
  IconSquare,
  IconTag,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryAddToAlbum } from "@/app/_components/gallery-add-to-album"
import { setGalleryImagesPin } from "@/app/actions"
import { setGalleryFavorites } from "@/app/actions/favorites"
import { attachGalleryTagToImages } from "@/app/actions/tags"
import { gallerySans } from "@/components/gallery-chrome"
import { describeBulkTagAttach } from "@/lib/gallery/bulk-tag"
import { downloadAlbumZip } from "@/lib/gallery/download-album"
import { describeWallSelectionCount } from "@/lib/gallery/wall-selection"
import {
  buildWallSelectionShareText,
  describeWallSelectionCopy,
} from "@/lib/gallery/wall-selection-share"
import { buildAlbumZipFilename } from "@/lib/gallery/zip-names"

export function GalleryWallSelectBar({
  selectionMode,
  selectedCount,
  allSelected,
  isSignedIn,
  isAdmin = false,
  selectedIds,
  selectedZipItems = [],
  savedFilterActive = false,
  onToggleMode,
  onToggleSelectAll,
  onClear,
  onAdded,
  onUnsaved,
  onPinned,
}: {
  selectionMode: boolean
  selectedCount: number
  allSelected: boolean
  isSignedIn: boolean
  isAdmin?: boolean
  selectedIds: string[]
  /** Ordered covers for ZIP download (name + storage path). */
  selectedZipItems?: Array<{
    name: string
    image_path: string
    position: number
  }>
  /** When viewing ?saved=1, offer bulk Unsave. */
  savedFilterActive?: boolean
  onToggleMode: () => void
  onToggleSelectAll: () => void
  onClear: () => void
  onAdded?: () => void
  onUnsaved?: () => void
  onPinned?: (pinned: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [saveOpenBusy, setSaveOpenBusy] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [tagDraft, setTagDraft] = useState("")

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
      onClear()
    })
  }

  const pinSelected = (pinned: boolean) => {
    if (selectedIds.length === 0 || pending || saveOpenBusy || !isAdmin) return
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

  const saveSelected = () => {
    if (selectedIds.length === 0 || pending || saveOpenBusy) return
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
    if (selectedIds.length === 0 || pending || saveOpenBusy) return
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
      `Preparing selection… 0/${selectedZipItems.length}`
    )
    try {
      const result = await downloadAlbumZip(selectedZipItems, {
        zipName: buildAlbumZipFilename("wall-selection"),
        onProgress: ({ completed, total }) => {
          toast.loading(`Preparing selection… ${completed}/${total}`, {
            id: toastId,
          })
        },
      })
      if (result.failed > 0) {
        toast.success(
          `Saved ${result.count} photo${result.count === 1 ? "" : "s"} as ZIP`,
          {
            id: toastId,
            description: `${result.failed} could not be fetched and were skipped.`,
          }
        )
      } else {
        toast.success(
          `Saved ${result.count} photo${result.count === 1 ? "" : "s"} as ZIP`,
          { id: toastId }
        )
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not build the ZIP"
      toast.error(message, { id: toastId })
    } finally {
      setZipBusy(false)
    }
  }

  const copySelectedLinks = async () => {
    if (selectedIds.length === 0) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    if (!origin) {
      toast.error("Could not copy links in this context.")
      return
    }
    const text = buildWallSelectionShareText(selectedIds, origin)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(describeWallSelectionCopy(selectedIds.length))
    } catch {
      toast.error("Could not copy to the clipboard.")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggleMode}
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
              "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900/15 bg-card/95 px-4 py-3 shadow-[0_12px_40px_-16px_rgba(24,24,27,0.45)] backdrop-blur-md"
            )}
            role="status"
            aria-live="polite"
          >
            <p className={cn(gallerySans(), "text-sm text-foreground")}>
              {describeWallSelectionCount(selectedCount)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
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
              {isSignedIn ? (
                <>
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
                  {savedFilterActive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedCount === 0 || pending}
                      className={cn(gallerySans(), "h-8 text-[11px] uppercase")}
                      onClick={unsaveSelected}
                    >
                      Unsave
                    </Button>
                  ) : null}
                  <form
                    onSubmit={tagSelected}
                    className="flex items-center gap-1.5"
                  >
                    <Input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      placeholder="Tag…"
                      aria-label="Tag to apply to selection"
                      disabled={selectedCount === 0 || pending}
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
                      className={cn(
                        gallerySans(),
                        "h-8 gap-1.5 text-[11px] uppercase"
                      )}
                    >
                      <IconTag className="size-3.5" aria-hidden />
                      Tag
                    </Button>
                  </form>
                  {isAdmin ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selectedCount === 0 || pending}
                        className={cn(
                          gallerySans(),
                          "h-8 text-[11px] uppercase"
                        )}
                        onClick={() => pinSelected(true)}
                      >
                        Pin
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={selectedCount === 0 || pending}
                        className={cn(
                          gallerySans(),
                          "h-8 text-[11px] uppercase"
                        )}
                        onClick={() => pinSelected(false)}
                      >
                        Unpin
                      </Button>
                    </>
                  ) : null}
                  <GalleryAddToAlbum
                    imageIds={selectedIds}
                    triggerLabel={
                      selectedCount > 0
                        ? `Add ${selectedCount} to album`
                        : "Add to album"
                    }
                    onAdded={() => {
                      onAdded?.()
                      onClear()
                    }}
                  />
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
          </div>
        </div>
      ) : null}
    </>
  )
}
