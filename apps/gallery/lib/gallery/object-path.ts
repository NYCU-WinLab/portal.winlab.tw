import { ALLOWED_MIME, inferMimeFromFilename } from "@/lib/gallery/mime"

const UUID_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]{2,5})$/i

/**
 * Guards a browser-supplied storage object path before we trust it server-side:
 * it must live under the caller's own `${userId}/` prefix, be a single path
 * segment (no nested dirs, no `..` traversal), match the `<uuid>.<ext>` shape
 * the client writes, and carry an allowed media extension.
 */
export function isValidClientObjectPath(
  path: string,
  userId: string,
  opts: { imageOnly?: boolean } = {}
): boolean {
  if (!path.startsWith(`${userId}/`)) return false
  const rest = path.slice(userId.length + 1)
  if (!rest || rest.includes("/") || rest.includes("..")) return false

  const m = rest.match(UUID_FILE_RE)
  if (!m?.[1]) return false
  const ext = m[1].toLowerCase()
  const pseudoMime =
    ext === "jpg" ? "image/jpeg" : inferMimeFromFilename(`x.${ext}`)
  if (!pseudoMime || !ALLOWED_MIME.has(pseudoMime)) return false
  if (opts.imageOnly && !pseudoMime.startsWith("image/")) return false
  return true
}
