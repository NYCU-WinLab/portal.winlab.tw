export const ARTWORK_NAME_MAX = 120

/** Strip control chars / nulls and clamp length for gallery_images.name. */
export function sanitizeArtworkName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return "Untitled"
  if (cleaned.length <= ARTWORK_NAME_MAX) return cleaned
  return cleaned.slice(0, ARTWORK_NAME_MAX).trimEnd() || "Untitled"
}

export function inferArtworkName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim()
  return sanitizeArtworkName(base || "Untitled")
}

/**
 * Single file → base name or inferred file stem.
 * Multi-file sequence → cover uses base; later shots append the index.
 */
export function buildArtworkName(
  files: { name: string }[],
  trimmedBaseName: string,
  index: number
): string {
  const file = files[index]
  if (!file) return sanitizeArtworkName(trimmedBaseName || "Untitled")

  if (files.length === 1) {
    return sanitizeArtworkName(trimmedBaseName || inferArtworkName(file.name))
  }

  if (!trimmedBaseName) {
    return inferArtworkName(file.name)
  }

  const base = sanitizeArtworkName(trimmedBaseName)
  return index === 0 ? base : sanitizeArtworkName(`${base}${index}`)
}
