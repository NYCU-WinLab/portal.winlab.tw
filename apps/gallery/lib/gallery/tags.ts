export const GALLERY_TAG_NAME_MAX = 40
export const GALLERY_TAGS_PER_IMAGE_MAX = 10

export type GalleryTag = {
  id: string
  name: string
  slug: string
}

export type GalleryTagSuggestion = GalleryTag & {
  use_count: number
}

/**
 * Normalize a free-form label into a URL-safe slug.
 * Returns null when nothing usable remains.
 */
export function normalizeGalleryTagSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, GALLERY_TAG_NAME_MAX)

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  return slug
}

/** Trim + length-check a display name; slug is derived separately. */
export function normalizeGalleryTagName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ")
  if (!name || name.length > GALLERY_TAG_NAME_MAX) return null
  if (!normalizeGalleryTagSlug(name)) return null
  return name
}

export function parseGalleryTagList(
  raw: string[] | null | undefined
): string[] {
  if (!raw?.length) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of raw) {
    const name = normalizeGalleryTagName(item)
    if (!name) continue
    const slug = normalizeGalleryTagSlug(name)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    names.push(name)
    if (names.length >= GALLERY_TAGS_PER_IMAGE_MAX) break
  }
  return names
}
