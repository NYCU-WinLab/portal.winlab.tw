"use client"

import { useEffect } from "react"

import {
  buildGallerySwCacheMessage,
  isGalleryStorageMediaUrl,
} from "@/lib/gallery/offline-cache"

export function GalleryServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) => {
        console.error("[gallery] service worker register failed", error)
      })
  }, [])

  return null
}

/** Best-effort: warm the SW media cache for wall thumbs / lightbox assets. */
export function cacheGalleryMediaUrls(urls: string[]) {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  const filtered = urls.filter(isGalleryStorageMediaUrl)
  if (filtered.length === 0) return
  const message = buildGallerySwCacheMessage(filtered)
  const controller = navigator.serviceWorker.controller
  if (controller) {
    controller.postMessage(message)
    return
  }
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(message)
  })
}
