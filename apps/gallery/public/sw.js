/* Gallery PWA Phase 2 — read-only offline shell.
 * Precaches the app shell; runtime-caches Supabase gallery media after first view.
 * No offline write queue.
 */
const VERSION = "gallery-sw-v3"
const SHELL_CACHE = `${VERSION}-shell`
const MEDIA_CACHE = `${VERSION}-media`

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
  "/icons/mark.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll(SHELL_URLS)
      await self.skipWaiting()
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("gallery-sw-") && !key.startsWith(VERSION)
          )
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

function isGalleryMedia(url) {
  try {
    const parsed = new URL(url)
    return (
      parsed.pathname.includes("/storage/v1/object/public/gallery/") ||
      parsed.pathname.includes("/storage/v1/render/image/public/gallery/")
    )
  } catch {
    return false
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (isGalleryMedia(request.url)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE))
    return
  }

  if (url.origin === self.location.origin && request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request))
  }
})

self.addEventListener("message", (event) => {
  const data = event.data
  if (
    !data ||
    data.type !== "GALLERY_CACHE_URLS" ||
    !Array.isArray(data.urls)
  ) {
    return
  }
  event.waitUntil(cacheMediaUrls(data.urls))
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const fallback = await cache.match(request)
    if (fallback) return fallback
    throw error
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put("/", response.clone())
    }
    return response
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      (await caches.match("/"))
    if (cached) return cached
    return new Response("Gallery is offline and this page is not cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}

async function cacheMediaUrls(urls) {
  const cache = await caches.open(MEDIA_CACHE)
  const unique = [...new Set(urls.filter((url) => typeof url === "string"))]
  // Cap warm batch so we don't thrash storage on long walls.
  const batch = unique.filter(isGalleryMedia).slice(0, 64)
  await Promise.all(
    batch.map(async (url) => {
      try {
        const existing = await cache.match(url)
        if (existing) return
        const response = await fetch(url, { mode: "cors", credentials: "omit" })
        if (response.ok) await cache.put(url, response.clone())
      } catch {
        // Best-effort cache warm; ignore network failures.
      }
    })
  )
}
