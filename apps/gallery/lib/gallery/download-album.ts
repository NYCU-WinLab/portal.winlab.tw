"use client"

import { getGalleryImageUrl } from "@/lib/gallery/url"
import { saveZip, type ZipEntry } from "@/lib/gallery/zip"
import {
  ALBUM_ZIP_MAX_ITEMS,
  buildAlbumEntryName,
  buildAlbumZipFilename,
  sortAlbumZipItems,
  type AlbumZipSource,
} from "@/lib/gallery/zip-names"

export type DownloadAlbumProgress = {
  completed: number
  total: number
}

export type DownloadAlbumZipOptions = {
  zipName?: string
  concurrency?: number
  onProgress?: (progress: DownloadAlbumProgress) => void
  resolveUrl?: (imagePath: string) => string
  fetchImpl?: typeof fetch
  save?: (filename: string, entries: ZipEntry[]) => Promise<void>
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await mapper(item, index)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

/**
 * Fetch each album original from the public gallery bucket and save a ZIP.
 * Same client-side pattern as sequence / trip downloads — no Route Handler.
 */
export async function downloadAlbumZip(
  items: AlbumZipSource[],
  options: DownloadAlbumZipOptions = {}
): Promise<{ count: number; filename: string }> {
  if (items.length === 0) {
    throw new Error("This album has no photos to download")
  }
  if (items.length > ALBUM_ZIP_MAX_ITEMS) {
    throw new Error(
      `Albums longer than ${ALBUM_ZIP_MAX_ITEMS} photos need to be split first`
    )
  }

  const ordered = sortAlbumZipItems(items)
  const concurrency = Math.max(1, options.concurrency ?? 3)
  const resolveUrl = options.resolveUrl ?? getGalleryImageUrl
  const fetchImpl = options.fetchImpl ?? fetch
  const save = options.save ?? saveZip
  const used = new Set<string>()
  const planned = ordered.map((item, index) => ({
    item,
    name: buildAlbumEntryName(used, index, item, ordered.length),
  }))
  const total = planned.length
  let completed = 0

  options.onProgress?.({ completed: 0, total })

  const entries = await mapPool(
    planned,
    concurrency,
    async ({ item, name }, index) => {
      const url = resolveUrl(item.image_path)
      const response = await fetchImpl(url)
      if (!response.ok) {
        throw new Error(
          `Could not fetch photo ${index + 1} (${response.status})`
        )
      }
      const blob = await response.blob()
      completed += 1
      options.onProgress?.({ completed, total })
      return { name, blob }
    }
  )

  const albumTitle = ordered[0]?.name ?? "album"
  const filename = options.zipName ?? buildAlbumZipFilename(albumTitle)
  await save(filename, entries)
  return { count: entries.length, filename }
}
