"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { ReactionGlyph } from "@/app/_components/reaction-glyph"
import {
  GALLERY_REACTIONS,
  REACTION_EMOJI,
  isGalleryReaction,
  totalReactions,
  type GalleryReaction,
  type ReactionCounts,
} from "@/lib/gallery/reactions"
import { describeChooseReactionAriaLabel } from "@/lib/gallery/reaction-wall-labels"
import { shouldOpenReactionFromSignal } from "@/lib/gallery/keyboard-hint-labels"
import { shouldStopLightboxEscape } from "@/lib/gallery/reaction-escape"
import { nextRadioIndex } from "@/lib/gallery/radio-nav"

const HOVER_SHOW_MS = 400
const HOVER_HIDE_MS = 250
const LONG_PRESS_MS = 450

function reactionFromPoint(x: number, y: number): GalleryReaction | null {
  const el = document.elementFromPoint(x, y)
  const btn = el?.closest<HTMLElement>("[data-reaction]")
  const value = btn?.dataset.reaction
  return value && isGalleryReaction(value) ? value : null
}

export function ReactionBar({
  counts,
  myReaction,
  canReact,
  busy = false,
  openSignal = 0,
  onReact,
}: {
  counts: ReactionCounts
  myReaction: GalleryReaction | null
  canReact: boolean
  /** True while a reaction mutation is in flight. */
  busy?: boolean
  /** Increment to open the picker from an external keyboard shortcut. */
  openSignal?: number
  onReact: (reaction: GalleryReaction) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hoveredReaction, setHoveredReaction] =
    useState<GalleryReaction | null>(null)

  const zoneRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hoverShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressOpened = useRef(false)
  const touchAwaitingPick = useRef(false)
  const suppressClick = useRef(false)
  const touchPickHandled = useRef(false)
  const activePointerId = useRef<number | null>(null)

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
    clearLongPress()
    longPressOpened.current = false
    touchAwaitingPick.current = false
    activePointerId.current = null
    setHoveredReaction(null)
    setPickerOpen(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }, [clearHoverShow, clearHoverHide, clearLongPress])

  const scheduleClose = useCallback(() => {
    if (touchAwaitingPick.current || longPressOpened.current) return
    clearHoverHide()
    hoverHideTimer.current = setTimeout(() => {
      setPickerOpen(false)
      setHoveredReaction(null)
    }, HOVER_HIDE_MS)
  }, [clearHoverHide])

  const pickReaction = useCallback(
    (reaction: GalleryReaction) => {
      if (busy || !canReact) return
      onReact(reaction)
      closePicker()
      suppressClick.current = true
    },
    [busy, canReact, closePicker, onReact]
  )

  useEffect(() => {
    return () => {
      clearHoverShow()
      clearHoverHide()
      clearLongPress()
    }
  }, [clearHoverHide, clearHoverShow, clearLongPress])

  // Mobile: after long-press release, dismiss only on emoji tap or outside tap.
  useEffect(() => {
    if (!pickerOpen) return

    const onDocPointerDown = (e: PointerEvent) => {
      if (!touchAwaitingPick.current) return
      const target = e.target as Node
      if (!zoneRef.current) return

      if (zoneRef.current.contains(target)) {
        if ((target as Element).closest?.("[data-reaction]")) return
        closePicker()
        suppressClick.current = true
        return
      }

      closePicker()
      suppressClick.current = true
    }

    document.addEventListener("pointerdown", onDocPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true)
  }, [pickerOpen, closePicker])

  useEffect(() => {
    if (!pickerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && shouldStopLightboxEscape(pickerOpen)) {
        event.preventDefault()
        event.stopPropagation()
        closePicker()
        return
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        const reaction =
          hoveredReaction ?? myReaction ?? GALLERY_REACTIONS[0] ?? null
        if (reaction) pickReaction(reaction)
        return
      }

      const navKey =
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Home" ||
        event.key === "End"
          ? event.key
          : null
      if (!navKey) return

      event.preventDefault()
      event.stopPropagation()
      const current =
        hoveredReaction != null
          ? GALLERY_REACTIONS.indexOf(hoveredReaction)
          : myReaction
            ? GALLERY_REACTIONS.indexOf(myReaction)
            : 0
      const next = nextRadioIndex(
        current < 0 ? 0 : current,
        GALLERY_REACTIONS.length,
        navKey
      )
      const reaction = GALLERY_REACTIONS[next]
      if (!reaction) return
      setHoveredReaction(reaction)
      const button = zoneRef.current?.querySelector<HTMLButtonElement>(
        `[data-reaction="${reaction}"]`
      )
      button?.focus()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [pickerOpen, closePicker, hoveredReaction, myReaction, pickReaction])

  const focusReactionButton = (reaction: GalleryReaction) => {
    queueMicrotask(() => {
      const button = zoneRef.current?.querySelector<HTMLButtonElement>(
        `[data-reaction="${reaction}"]`
      )
      button?.focus()
    })
  }

  const openPickerFromKeyboard = () => {
    if (!canReact || busy) return
    openPicker()
    const reaction = myReaction ?? GALLERY_REACTIONS[0]
    if (reaction) {
      setHoveredReaction(reaction)
      focusReactionButton(reaction)
    }
  }

  const openSignalSeen = useRef(0)
  useEffect(() => {
    if (!shouldOpenReactionFromSignal(openSignalSeen.current, openSignal)) {
      return
    }
    openSignalSeen.current = openSignal
    if (!canReact || busy) return
    openPicker()
    const reaction = myReaction ?? GALLERY_REACTIONS[0]
    if (!reaction) return
    setHoveredReaction(reaction)
    queueMicrotask(() => {
      zoneRef.current
        ?.querySelector<HTMLButtonElement>(`[data-reaction="${reaction}"]`)
        ?.focus()
    })
  }, [openSignal, canReact, busy, myReaction, openPicker])

  const onZoneEnter = (e: React.PointerEvent) => {
    if (!canReact || e.pointerType === "touch" || touchAwaitingPick.current)
      return
    clearHoverHide()
    clearHoverShow()
    hoverShowTimer.current = setTimeout(openPicker, HOVER_SHOW_MS)
  }

  const onZoneLeave = (e: React.PointerEvent) => {
    if (
      touchAwaitingPick.current ||
      longPressOpened.current ||
      e.pointerType === "touch"
    )
      return
    clearHoverShow()
    scheduleClose()
  }

  const onZonePointerDown = (e: React.PointerEvent) => {
    if (!canReact || e.pointerType !== "touch") return
    if (e.button !== 0) return

    if (touchAwaitingPick.current) {
      if ((e.target as Element).closest?.("[data-reaction]")) return
      closePicker()
      suppressClick.current = true
      return
    }

    longPressOpened.current = false
    suppressClick.current = false
    activePointerId.current = e.pointerId
    clearLongPress()

    longPressTimer.current = setTimeout(() => {
      longPressOpened.current = true
      openPicker()
      zoneRef.current?.setPointerCapture(e.pointerId)
      if (navigator.vibrate) navigator.vibrate(10)
    }, LONG_PRESS_MS)
  }

  const onZonePointerMove = (e: React.PointerEvent) => {
    if (!longPressOpened.current || e.pointerId !== activePointerId.current)
      return
    if (touchAwaitingPick.current) return
    const reaction = reactionFromPoint(e.clientX, e.clientY)
    setHoveredReaction(reaction)
  }

  const onZonePointerUp = (e: React.PointerEvent) => {
    clearLongPress()

    if (longPressOpened.current && e.pointerId === activePointerId.current) {
      touchAwaitingPick.current = true
      longPressOpened.current = false
      suppressClick.current = true
      activePointerId.current = null
      try {
        zoneRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        // already released
      }
      return
    }

    activePointerId.current = null
  }

  const onZonePointerCancel = (e: React.PointerEvent) => {
    clearLongPress()
    if (longPressOpened.current || touchAwaitingPick.current) {
      closePicker()
      suppressClick.current = true
    }
    if (e.pointerId === activePointerId.current) {
      activePointerId.current = null
    }
  }

  const onTriggerClick = () => {
    if (!canReact || busy || suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (touchAwaitingPick.current) {
      closePicker()
      return
    }
    onReact(myReaction ?? "like")
    closePicker()
  }

  const displayReaction: GalleryReaction = myReaction ?? "like"

  return (
    <div
      ref={zoneRef}
      className="relative shrink-0 touch-manipulation not-italic select-none [-webkit-touch-callout:none]"
      onPointerEnter={onZoneEnter}
      onPointerLeave={onZoneLeave}
      onPointerDown={onZonePointerDown}
      onPointerMove={onZonePointerMove}
      onPointerUp={onZonePointerUp}
      onPointerCancel={onZonePointerCancel}
    >
      <div
        role="menu"
        aria-label={describeChooseReactionAriaLabel()}
        aria-hidden={!pickerOpen}
        className={cn(
          "absolute right-0 bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-1 shadow-lg select-none",
          "transition-all duration-200 ease-out",
          pickerOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-95 opacity-0"
        )}
        onPointerEnter={() =>
          canReact && !touchAwaitingPick.current && clearHoverHide()
        }
      >
        {GALLERY_REACTIONS.map((reaction) => {
          const active = myReaction === reaction
          const highlighted = hoveredReaction === reaction
          return (
            <button
              key={reaction}
              type="button"
              role="menuitem"
              data-reaction={reaction}
              disabled={!canReact || busy}
              aria-busy={busy || undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => {
                if (e.pointerType !== "touch" || !pickerOpen) return
                e.stopPropagation()
                touchPickHandled.current = true
                pickReaction(reaction)
              }}
              onClick={() => {
                if (touchPickHandled.current) {
                  touchPickHandled.current = false
                  return
                }
                pickReaction(reaction)
              }}
              aria-label={
                active
                  ? `Remove ${REACTION_EMOJI[reaction]} reaction`
                  : `${REACTION_EMOJI[reaction]} reaction`
              }
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center rounded-full transition-transform select-none",
                reaction === "point" ? "h-11 w-[3.25rem] px-1" : "h-11 w-11",
                (active || highlighted) && "scale-125 bg-foreground/10"
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
        ref={triggerRef}
        type="button"
        disabled={!canReact || busy}
        aria-busy={busy || undefined}
        onClick={onTriggerClick}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(event) => {
          if (!canReact || busy || pickerOpen) return
          if (
            event.key === "ArrowUp" ||
            (event.key === "Enter" && event.altKey)
          ) {
            event.preventDefault()
            openPickerFromKeyboard()
          }
        }}
        aria-expanded={pickerOpen}
        aria-haspopup="menu"
        aria-pressed={Boolean(myReaction)}
        aria-label={
          myReaction
            ? `Your reaction ${REACTION_EMOJI[myReaction]}. ArrowUp or Alt+Enter for more`
            : "React. ArrowUp or Alt+Enter for more"
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors select-none",
          myReaction
            ? "border-foreground/20 bg-foreground/10 text-foreground"
            : "border-foreground/20 bg-background/80 text-foreground hover:bg-foreground/10",
          (!canReact || busy) && "cursor-not-allowed opacity-70"
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
