"use client"

import { useSyncExternalStore } from "react"

type MemoriesOverlayState = {
  lightboxOpen: boolean
  slideshowOpen: boolean
}

let state: MemoriesOverlayState = {
  lightboxOpen: false,
  slideshowOpen: false,
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setMemoriesOverlayState(
  next: Partial<MemoriesOverlayState>
): void {
  state = { ...state, ...next }
  emit()
}

export function getMemoriesOverlayState(): MemoriesOverlayState {
  return state
}

export function subscribeMemoriesOverlay(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMemoriesOverlayState(): MemoriesOverlayState {
  return useSyncExternalStore(
    subscribeMemoriesOverlay,
    getMemoriesOverlayState,
    getMemoriesOverlayState
  )
}
