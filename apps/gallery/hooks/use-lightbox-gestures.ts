"use client"

import { useRef, type RefObject } from "react"

import { resolveLightboxSwipe } from "@/lib/gallery/lightbox-gestures"

type LightboxGestureHandlers = {
  onPrev: () => void
  onNext: () => void
  onSwipeUp: () => void
  onSwipeDown?: () => void
}

export function useLightboxGestures(
  ref: RefObject<HTMLDivElement | null>,
  {
    onPrev,
    onNext,
    onSwipeUp,
    onSwipeDown,
    enabled,
  }: LightboxGestureHandlers & {
    enabled: boolean
  }
) {
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (event: React.TouchEvent) => {
    if (!enabled) return
    const touch = event.touches[0]
    if (!touch) return
    startRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    if (!enabled || !startRef.current) return
    const touch = event.changedTouches[0]
    if (!touch) return

    const deltaX = touch.clientX - startRef.current.x
    const deltaY = touch.clientY - startRef.current.y
    startRef.current = null

    const swipe = resolveLightboxSwipe(deltaX, deltaY)
    if (swipe === "prev") onPrev()
    else if (swipe === "next") onNext()
    else if (swipe === "up") onSwipeUp()
    else if (swipe === "down") onSwipeDown?.()
  }

  return {
    gestureProps: {
      ref,
      onTouchStart,
      onTouchEnd,
    },
  }
}
