/* Gallery PWA Phase 2 — read-only offline shell.
 * Precaches the app shell; runtime-caches Supabase gallery media after first view.
 * No offline write queue.
 */
const VERSION = "gallery-sw-v5"
const SHELL_CACHE = `${VERSION}-shell`
const MEDIA_CACHE = `${VERSION}-media`

// Cap the runtime media cache so a heavy scroller doesn't fill device storage.
// Cache API keys come back in insertion order, so trimming from the front is a
// simple FIFO eviction of the least-recently-added media.
const MEDIA_CACHE_MAX_ENTRIES = 220

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
      try {
        const cache = await caches.open(SHELL_CACHE)
        await Promise.all(
          SHELL_URLS.map(async (url) => {
            try {
              await cache.add(url)
            } catch {
              // Best-effort precache — one missing asset must not block install.
            }
          })
        )
      } catch {
        // Cache API unavailable (private mode / quota).
      }
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
  let cache
  try {
    cache = await caches.open(cacheName)
    const cached = await cache.match(request)
    if (cached) return cached
  } catch {
    cache = null
  }
  try {
    const response = await fetch(request)
    if (response.ok && cache) {
      try {
        await cache.put(request, response.clone())
        await trimCache(cache, MEDIA_CACHE_MAX_ENTRIES)
      } catch {
        // Quota / private mode — still return the network response.
      }
    }
    return response
  } catch (error) {
    if (cache) {
      const fallback = await cache.match(request)
      if (fallback) return fallback
    }
    throw error
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  const overflow = keys.slice(0, keys.length - maxEntries)
  await Promise.all(overflow.map((key) => cache.delete(key)))
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
  try {
    const cache = await caches.open(MEDIA_CACHE)
    const unique = [...new Set(urls.filter((url) => typeof url === "string"))]
    // Cap warm batch so we don't thrash storage on long walls.
    const batch = unique.filter(isGalleryMedia).slice(0, 64)
    await Promise.all(
      batch.map(async (url) => {
        try {
          const existing = await cache.match(url)
          if (existing) return
          const response = await fetch(url, {
            mode: "cors",
            credentials: "omit",
          })
          if (response.ok) await cache.put(url, response.clone())
        } catch {
          // Best-effort cache warm; ignore network / quota failures.
        }
      })
    )
    try {
      await trimCache(cache, MEDIA_CACHE_MAX_ENTRIES)
    } catch {
      // trim is best-effort
    }
  } catch {
    // Cache API unavailable — offline warm is optional.
  }
}
