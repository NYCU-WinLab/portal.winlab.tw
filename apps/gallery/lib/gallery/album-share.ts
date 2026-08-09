/**
 * Build the shareable album path and absolute URL helpers.
 * Path is always `/albums/<slug>` — no query params.
 */

export function buildGalleryAlbumHref(slug: string): string | null {
  const trimmed = slug.trim().toLowerCase()
  if (!trimmed || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) return null
  return `/albums/${trimmed}`
}

export function buildGalleryAlbumShareUrl(
  slug: string,
  origin?: string | null
): string | null {
  const href = buildGalleryAlbumHref(slug)
  if (!href) return null
  const base =
    origin?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : null)
  if (!base) return null
  return `${base}${href}`
}

/**
 * Prefer Web Share when available; otherwise copy to clipboard.
 * Pass `preferCopy: true` after create flows so mobile does not pop the sheet.
 * Returns which path succeeded so callers can toast accordingly.
 */
export async function shareOrCopyAlbumLink(input: {
  slug: string
  title: string
  text?: string | null
  origin?: string | null
  preferCopy?: boolean
}): Promise<"shared" | "copied"> {
  const url = buildGalleryAlbumShareUrl(input.slug, input.origin)
  if (!url) throw new Error("Invalid album link")

  if (!input.preferCopy) {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title: input.title,
          text: input.text?.trim() || undefined,
          url,
        })
        return "shared"
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error
      }
      // Fall through to clipboard for share failures (unsupported target, etc.)
    }
  }

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable")
  }
  await navigator.clipboard.writeText(url)
  return "copied"
}
