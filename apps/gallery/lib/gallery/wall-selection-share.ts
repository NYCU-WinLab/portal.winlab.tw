import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"

/** Absolute photo deep links for a wall selection, one per line. */
export function buildWallSelectionShareText(
  photoIds: string[],
  origin: string
): string {
  const base = origin.replace(/\/$/, "")
  const lines: string[] = []
  const seen = new Set<string>()
  for (const raw of photoIds) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    lines.push(`${base}${buildGalleryPhotoHref({ photoId: id })}`)
  }
  return lines.join("\n")
}

export function describeWallSelectionCopy(count: number): string {
  if (count <= 0) return "Nothing to copy."
  return `Copied ${count} link${count === 1 ? "" : "s"}.`
}
