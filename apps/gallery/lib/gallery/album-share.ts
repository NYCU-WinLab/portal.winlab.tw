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

export type AlbumShareResult =
  | { ok: true; mode: "shared" | "copied" }
  | {
      ok: false
      reason: "invalid" | "aborted" | "clipboard" | "unknown"
      message: string
    }

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * Prefer Web Share when available; otherwise copy to clipboard.
 * Pass `preferCopy: true` after create flows so mobile does not pop the sheet.
 * Never throws — callers toast from the result.
 */
export async function shareOrCopyAlbumLink(input: {
  slug: string
  title: string
  text?: string | null
  origin?: string | null
  preferCopy?: boolean
}): Promise<AlbumShareResult> {
  const url = buildGalleryAlbumShareUrl(input.slug, input.origin)
  if (!url) {
    return {
      ok: false,
      reason: "invalid",
      message: "Invalid album link",
    }
  }

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
        return { ok: true, mode: "shared" }
      }
    } catch (error) {
      if (isAbortError(error)) {
        return { ok: false, reason: "aborted", message: "Share cancelled" }
      }
      // Fall through to clipboard for share failures (unsupported target, etc.)
    }
  }

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return {
      ok: false,
      reason: "clipboard",
      message:
        "Clipboard is unavailable here — open the album and copy the URL from the address bar.",
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return { ok: true, mode: "copied" }
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: "aborted", message: "Share cancelled" }
    }
    return {
      ok: false,
      reason: "clipboard",
      message:
        "Could not copy the share link — try again or copy from the address bar.",
    }
  }
}
