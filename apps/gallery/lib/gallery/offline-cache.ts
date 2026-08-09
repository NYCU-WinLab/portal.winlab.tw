/** Cache names + helpers for gallery PWA Phase 2 (read-only offline shell). */

export const GALLERY_SW_VERSION = "gallery-sw-v4"
export const GALLERY_SHELL_CACHE = `${GALLERY_SW_VERSION}-shell`
export const GALLERY_MEDIA_CACHE = `${GALLERY_SW_VERSION}-media`

export const GALLERY_SW_CACHE_URLS_TYPE = "GALLERY_CACHE_URLS" as const

export type GallerySwCacheUrlsMessage = {
  type: typeof GALLERY_SW_CACHE_URLS_TYPE
  urls: string[]
}

export function isGalleryStorageMediaUrl(url: string): boolean {
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

export function buildGallerySwCacheMessage(
  urls: string[],
  limit = 64
): GallerySwCacheUrlsMessage {
  return {
    type: GALLERY_SW_CACHE_URLS_TYPE,
    urls: Array.from(new Set(urls.filter(Boolean))).slice(0, limit),
  }
}
