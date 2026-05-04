/** Shared client + server validation for gallery image uploads. */

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
])

/** Browsers / OS file pickers often send "" or application/octet-stream. */
export function resolveImageMimeType(file: File): string | null {
  let t = file.type.trim().toLowerCase()
  if (t === "image/jpg") t = "image/jpeg"

  if (t && t !== "application/octet-stream" && ALLOWED_MIME.has(t)) {
    return t
  }

  const inferred = inferMimeFromFilename(file.name)
  if (inferred && ALLOWED_MIME.has(inferred)) return inferred

  return null
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
    default:
      return "bin"
  }
}
