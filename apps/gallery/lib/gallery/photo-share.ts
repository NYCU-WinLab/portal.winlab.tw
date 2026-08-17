export type PhotoShareResult =
  | { ok: true; mode: "shared" | "copied" }
  | {
      ok: false
      reason: "aborted" | "clipboard" | "unknown"
      message: string
    }

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * Prefer Web Share when available; otherwise copy the photo URL.
 * Never throws — callers toast from the result.
 */
export async function shareOrCopyPhotoLink(input: {
  url: string
  title: string
}): Promise<PhotoShareResult> {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({ title: input.title, url: input.url })
      return { ok: true, mode: "shared" }
    }
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: "aborted", message: "Share cancelled" }
    }
    // Fall through to clipboard.
  }

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return {
      ok: false,
      reason: "clipboard",
      message: "Could not copy link.",
    }
  }

  try {
    await navigator.clipboard.writeText(input.url)
    return { ok: true, mode: "copied" }
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: "aborted", message: "Share cancelled" }
    }
    return {
      ok: false,
      reason: "clipboard",
      message: "Could not copy link.",
    }
  }
}
