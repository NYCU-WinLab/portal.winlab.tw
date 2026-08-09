"use client"

import { IconAlbum, IconCheckbox, IconSquare, IconX } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { GalleryAddToAlbum } from "@/app/_components/gallery-add-to-album"
import { gallerySans } from "@/components/gallery-chrome"
import { describeWallSelectionCount } from "@/lib/gallery/wall-selection"

export function GalleryWallSelectBar({
  selectionMode,
  selectedCount,
  allSelected,
  isSignedIn,
  selectedIds,
  onToggleMode,
  onToggleSelectAll,
  onClear,
  onAdded,
}: {
  selectionMode: boolean
  selectedCount: number
  allSelected: boolean
  isSignedIn: boolean
  selectedIds: string[]
  onToggleMode: () => void
  onToggleSelectAll: () => void
  onClear: () => void
  onAdded?: () => void
}) {
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
              {isSignedIn ? (
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
                  title="Sign in to add to an album"
                >
                  <IconAlbum className="size-3.5" aria-hidden />
                  Sign in to add
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
