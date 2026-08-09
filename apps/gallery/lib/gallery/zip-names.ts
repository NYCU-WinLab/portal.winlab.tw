/** Pure ZIP entry / archive naming helpers (no DOM, no network). */

const UNSAFE_NAME_CHARS = /[\\/:*?"<>|\s]/g

export function safeFolderName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARS, "_").trim()
  const collapsed = cleaned.replace(/_+/g, "_").replace(/^_|_$/g, "")
  return collapsed.length > 0 ? collapsed : "unknown"
}

export function uniquifyName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf(".")
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ""
  let i = 2
  let candidate = `${base} (${i})${ext}`
  while (used.has(candidate)) {
    i++
    candidate = `${base} (${i})${ext}`
  }
  used.add(candidate)
  return candidate
}

/** Extension including the leading dot, or "" if the path has none. */
export function extensionFromPath(path: string): string {
  const base = path.split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot) : ""
}

/** Keep display names that already have an extension; otherwise borrow from path. */
export function ensureExtension(name: string, imagePath: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    const fromPath = imagePath.split("/").pop() ?? "shot"
    return fromPath.length > 0 ? fromPath : "shot"
  }
  const lastSeg = trimmed.split(/[/\\]/).pop() ?? trimmed
  if (lastSeg.includes(".")) return lastSeg
  return `${lastSeg}${extensionFromPath(imagePath)}`
}

export type SequenceZipSource = {
  name: string
  image_path: string
  sequence_index?: number | null
}

/**
 * Sort for ZIP order: numeric sequence_index ascending, then original order.
 * Missing indexes sort after numbered shots, preserving relative order.
 */
export function sortSequenceZipItems<T extends SequenceZipSource>(
  items: T[]
): T[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const ai = a.item.sequence_index
      const bi = b.item.sequence_index
      const aNum = typeof ai === "number"
      const bNum = typeof bi === "number"
      if (aNum && bNum && ai !== bi) return ai - bi
      if (aNum !== bNum) return aNum ? -1 : 1
      return a.originalIndex - b.originalIndex
    })
    .map(({ item }) => item)
}

/** `01_cover.jpg`-style entry name, uniquified within the archive. */
export function buildSequenceEntryName(
  used: Set<string>,
  displayIndex: number,
  item: SequenceZipSource
): string {
  const padded = String(displayIndex + 1).padStart(2, "0")
  const withExt = ensureExtension(item.name, item.image_path)
  return uniquifyName(used, `${padded}_${withExt}`)
}

export function buildSequenceZipFilename(coverName: string): string {
  return `${safeFolderName(coverName)}-story.zip`
}

/** Soft cap so a runaway sequence cannot OOM the tab. */
export const SEQUENCE_ZIP_MAX_ITEMS = 40

export type AlbumZipSource = {
  name: string
  image_path: string
  position?: number | null
}

/**
 * Sort for album ZIP order: numeric position ascending, then original order.
 * Missing positions sort after numbered shots, preserving relative order.
 */
export function sortAlbumZipItems<T extends AlbumZipSource>(items: T[]): T[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const ai = a.item.position
      const bi = b.item.position
      const aNum = typeof ai === "number"
      const bNum = typeof bi === "number"
      if (aNum && bNum && ai !== bi) return ai - bi
      if (aNum !== bNum) return aNum ? -1 : 1
      return a.originalIndex - b.originalIndex
    })
    .map(({ item }) => item)
}

/** Pad width for album entry indexes (200 max → 3 digits). */
export function albumIndexPadWidth(total: number): number {
  return Math.max(2, String(Math.max(total, 1)).length)
}

/** `01_cover.jpg` / `001_cover.jpg`-style entry name for albums. */
export function buildAlbumEntryName(
  used: Set<string>,
  displayIndex: number,
  item: AlbumZipSource,
  total = 0
): string {
  const width = albumIndexPadWidth(total > 0 ? total : displayIndex + 1)
  const padded = String(displayIndex + 1).padStart(width, "0")
  const withExt = ensureExtension(item.name, item.image_path)
  return uniquifyName(used, `${padded}_${withExt}`)
}

export function buildAlbumZipFilename(albumTitle: string): string {
  return `${safeFolderName(albumTitle)}-album.zip`
}

/**
 * Soft cap aligned with GALLERY_ALBUM_PHOTOS_MAX so a full album still zips
 * without OOM-ing a typical tab.
 */
export const ALBUM_ZIP_MAX_ITEMS = 200
