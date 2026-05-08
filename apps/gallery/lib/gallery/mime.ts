/** Shared client + server validation for gallery media uploads. */

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
])

export const ALLOWED_VIDEO_MIME = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
])

/** Kept as the union of both — the storage bucket policy mirrors this. */
export const ALLOWED_MIME = new Set<string>([
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_VIDEO_MIME,
])

export type MediaKind = "image" | "video"

export type ResolvedMime = {
  kind: MediaKind
  mime: string
}

/** Browsers / OS file pickers often send "" or application/octet-stream. */
export function resolveMediaMimeType(file: File): ResolvedMime | null {
  let t = file.type.trim().toLowerCase()
  if (t === "image/jpg") t = "image/jpeg"

  if (t && t !== "application/octet-stream") {
    if (ALLOWED_IMAGE_MIME.has(t)) return { kind: "image", mime: t }
    if (ALLOWED_VIDEO_MIME.has(t)) return { kind: "video", mime: t }
  }

  const inferred = inferMimeFromFilename(file.name)
  if (!inferred) return null
  if (ALLOWED_IMAGE_MIME.has(inferred)) return { kind: "image", mime: inferred }
  if (ALLOWED_VIDEO_MIME.has(inferred)) return { kind: "video", mime: inferred }
  return null
}

/** Backwards-compat shim used by server-side validation paths. */
export function resolveImageMimeType(file: File): string | null {
  const resolved = resolveMediaMimeType(file)
  return resolved?.kind === "image" ? resolved.mime : null
}

export function inferMimeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "avif":
      return "image/avif"
    case "heic":
      return "image/heic"
    case "heif":
      return "image/heif"
    case "webm":
      return "video/webm"
    case "mp4":
    case "m4v":
      return "video/mp4"
    case "mov":
      return "video/quicktime"
    default:
      return null
  }
}

export function guessExtension(mime: string, filename: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  switch (mime) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "image/avif":
      return "avif"
    case "image/heic":
      return "heic"
    case "image/heif":
      return "heif"
    case "video/webm":
      return "webm"
    case "video/mp4":
      return "mp4"
    case "video/quicktime":
      return "mov"
    default:
      return "bin"
  }
}
