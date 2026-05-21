"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { ReactionGlyph } from "@/app/_components/reaction-glyph"
import {
  GALLERY_REACTIONS,
  REACTION_LABEL,
  totalReactions,
  type GalleryReaction,
  type ReactionCounts,
} from "@/lib/gallery/reactions"

const HOVER_SHOW_MS = 400
const HOVER_HIDE_MS = 250
const LONG_PRESS_MS = 500

export function ReactionBar({
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const hoverShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const suppressClick = useRef(false)

  const total = totalReactions(counts)

  const clearHoverShow = useCallback(() => {
    if (hoverShowTimer.current) {
      clearTimeout(hoverShowTimer.current)
      hoverShowTimer.current = null
    }
  }, [])

  const clearHoverHide = useCallback(() => {
    if (hoverHideTimer.current) {
      clearTimeout(hoverHideTimer.current)
      hoverHideTimer.current = null
    }
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const openPicker = useCallback(() => {
    if (!canReact) return
    clearHoverHide()
    setPickerOpen(true)
  }, [canReact, clearHoverHide])

  const closePicker = useCallback(() => {
    clearHoverShow()
    clearHoverHide()
    setPickerOpen(false)
  }, [clearHoverShow, clearHoverHide])

  const scheduleClose = useCallback(() => {
    clearHoverHide()
    hoverHideTimer.current = setTimeout(() => {
      setPickerOpen(false)
    }, HOVER_HIDE_MS)
  }, [clearHoverHide])

  useEffect(() => {
    return () => {
      clearHoverShow()
      clearHoverHide()
      clearLongPress()
    }
  }, [clearHoverHide, clearHoverShow, clearLongPress])

  const onZoneEnter = (e: React.PointerEvent) => {
    if (!canReact || e.pointerType === "touch") return
    clearHoverHide()
    clearHoverShow()
    hoverShowTimer.current = setTimeout(openPicker, HOVER_SHOW_MS)
  }

  const onZoneLeave = () => {
    clearHoverShow()
    scheduleClose()
  }

  const onTriggerPointerDown = (e: React.PointerEvent) => {
    if (!canReact) return
    longPressTriggered.current = false
    suppressClick.current = false

    if (e.pointerType === "touch") {
      clearLongPress()
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true
        suppressClick.current = true
        openPicker()
      }, LONG_PRESS_MS)
    }
  }

  const onTriggerPointerUp = () => {
    clearLongPress()
  }

  const onTriggerPointerCancel = () => {
    clearLongPress()
    longPressTriggered.current = false
  }

  const onTriggerClick = () => {
    if (!canReact || suppressClick.current) {
      suppressClick.current = false
      return
    }
    // Quick tap: like when empty; remove when you already reacted (FB-style).
    onReact(myReaction ?? "like")
    closePicker()
  }

  const displayReaction: GalleryReaction = myReaction ?? "like"

  return (
    <div
      className="relative shrink-0 not-italic"
      onPointerEnter={onZoneEnter}
      onPointerLeave={onZoneLeave}
    >
      <div
        role="menu"
        aria-label="Choose a reaction"
        aria-hidden={!pickerOpen}
        className={cn(
          "absolute right-0 bottom-full z-20 mb-2 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-1 shadow-lg",
          "transition-all duration-200 ease-out",
          pickerOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-95 opacity-0"
        )}
        onPointerEnter={() => canReact && clearHoverHide()}
      >
        {GALLERY_REACTIONS.map((reaction) => {
          const active = myReaction === reaction
          return (
            <button
              key={reaction}
              type="button"
              role="menuitem"
              disabled={!canReact}
              onClick={() => {
                onReact(reaction)
                closePicker()
              }}
              aria-label={
                active
                  ? `Remove ${REACTION_LABEL[reaction]}`
                  : REACTION_LABEL[reaction]
              }
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center rounded-full transition-transform hover:scale-110",
                reaction === "point"
                  ? "h-10 w-[3.25rem] px-1"
                  : "h-10 w-10",
                active && "bg-foreground/10"
              )}
            >
              <ReactionGlyph
                reaction={reaction}
                className={reaction === "point" ? "text-lg" : "text-2xl"}
              />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        disabled={!canReact}
        onClick={onTriggerClick}
        onPointerDown={onTriggerPointerDown}
        onPointerUp={onTriggerPointerUp}
        onPointerCancel={onTriggerPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={
          myReaction
            ? `Your reaction: ${REACTION_LABEL[myReaction]}. Hold or hover for more`
            : "Like. Hold or hover for more reactions"
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors",
          myReaction
            ? "border-foreground/20 bg-foreground/10 text-foreground"
            : "border-foreground/20 bg-background/80 text-foreground hover:bg-foreground/10",
          !canReact && "cursor-not-allowed opacity-70"
        )}
      >
        <ReactionGlyph
          reaction={displayReaction}
          className={cn("text-xl", !myReaction && "opacity-80")}
        />
        {total > 0 ? (
          <span className="min-w-[1ch] text-base tabular-nums md:text-lg">
            {total}
          </span>
        ) : null}
      </button>
    </div>
  )
}
