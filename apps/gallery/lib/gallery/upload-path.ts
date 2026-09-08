import { inferMimeFromFilename } from "@/lib/gallery/mime"

/** Matches the gallery bucket `file_size_limit` (30 MB). */
export const GALLERY_STORAGE_MAX_BYTES = 30 * 1024 * 1024

const SAFE_EXT_RE = /^[a-z0-9]{2,5}$/

/**
 * Map a resolved MIME type to the extension we write into Storage.
 * Prefer MIME over the original filename — phone cameras often ship
 * misleading or unicode-heavy names (IMG_….HEIC, "相片.JPG", Live Photo
 * bundles) that must not dictate the object key.
 */
export function storageExtensionForMime(mime: string): string | null {
  switch (mime.trim().toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
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
      return null
  }
}

/**
 * Last-resort extension from a filename. Strips path segments, takes the
 * final ASCII alnum suffix only — rejects spaces, unicode, and long tails.
 */
export function safeFilenameExtension(filename: string): string | null {
  const base = filename.replace(/^.*[/\\]/, "").trim()
  const dot = base.lastIndexOf(".")
  if (dot < 0 || dot === base.length - 1) return null
  const ext = base.slice(dot + 1).toLowerCase()
  if (!SAFE_EXT_RE.test(ext)) return null
  // Reject if the extension isn't one we know how to mime-map.
  if (!inferMimeFromFilename(`x.${ext}`)) return null
  return ext
}

/**
 * Extension for a Storage object key. MIME wins; filename is fallback only
 * when MIME is missing/generic (should be rare after resolveMediaMimeType).
 */
export function resolveStorageExtension(
  mime: string,
  filename: string
): string | null {
  return storageExtensionForMime(mime) ?? safeFilenameExtension(filename)
}

/** `${userId}/${uuid}.${ext}` — the only shape `isValidClientObjectPath` accepts. */
export function buildClientObjectPath(
  userId: string,
  ext: string,
  id: string = crypto.randomUUID()
): string {
  const safeExt = ext.toLowerCase()
  if (!SAFE_EXT_RE.test(safeExt)) {
    throw new Error(`Invalid storage extension: ${ext}`)
  }
  return `${userId}/${id}.${safeExt}`
}

/** Filename segment after `${userId}/`. */
export function objectNameFromPath(path: string, userId: string): string {
  if (!path.startsWith(`${userId}/`)) return path
  return path.slice(userId.length + 1)
}

export function formatByteLimit(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}
