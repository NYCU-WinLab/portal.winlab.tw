"use client"

import { useRef, type RefObject } from "react"

type LightboxGestureHandlers = {
  onPrev: () => void
  onNext: () => void
  onSwipeUp: () => void
}

export function useLightboxGestures(
  ref: RefObject<HTMLDivElement | null>,
  { onPrev, onNext, onSwipeUp, enabled }: LightboxGestureHandlers & {
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

    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    const threshold = 48

    if (absX < threshold && absY < threshold) return

    if (absX > absY) {
      if (deltaX > threshold) onPrev()
      else if (deltaX < -threshold) onNext()
      return
    }

    if (deltaY < -threshold) onSwipeUp()
  }

  return {
    gestureProps: {
      ref,
      onTouchStart,
      onTouchEnd,
    },
  }
}
