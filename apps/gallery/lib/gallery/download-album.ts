"use client"

import { mapPool } from "@/lib/gallery/map-pool"
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
  /**
   * When true (default), skip blank paths and failed fetches and still ZIP
   * whatever succeeded. When false, the first failure aborts the whole job.
   */
  continueOnError?: boolean
  onProgress?: (progress: DownloadAlbumProgress) => void
  resolveUrl?: (imagePath: string) => string
  fetchImpl?: typeof fetch
  save?: (filename: string, entries: ZipEntry[]) => Promise<void>
}

/**
 * Fetch each album original from the public gallery bucket and save a ZIP.
 * Same client-side pattern as sequence / trip downloads — no Route Handler.
 */
export async function downloadAlbumZip(
  items: AlbumZipSource[],
  options: DownloadAlbumZipOptions = {}
): Promise<{ count: number; failed: number; filename: string }> {
  if (items.length === 0) {
    throw new Error("This album has no photos to download")
  }
  if (items.length > ALBUM_ZIP_MAX_ITEMS) {
    throw new Error(
      `Albums longer than ${ALBUM_ZIP_MAX_ITEMS} photos need to be split first`
    )
  }

  const continueOnError = options.continueOnError !== false
  const withPaths = items.filter((item) => item.image_path.trim().length > 0)
  const skippedBlank = items.length - withPaths.length
  if (withPaths.length === 0) {
    throw new Error("This album has no downloadable photo files")
  }

  const ordered = sortAlbumZipItems(withPaths)
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
  let failed = skippedBlank

  options.onProgress?.({ completed: 0, total })

  const settled = await mapPool(
    planned,
    concurrency,
    async ({ item, name }, index) => {
      try {
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
        return { ok: true as const, entry: { name, blob } }
      } catch (error) {
        if (!continueOnError) throw error
        failed += 1
        completed += 1
        options.onProgress?.({ completed, total })
        return { ok: false as const }
      }
    }
  )

  const entries = settled.flatMap((result) => (result.ok ? [result.entry] : []))
  if (entries.length === 0) {
    throw new Error(
      failed > 0
        ? `Could not download any of the ${failed} photo${failed === 1 ? "" : "s"}`
        : "This album has no downloadable photo files"
    )
  }

  const albumTitle = ordered[0]?.name ?? "album"
  const filename = options.zipName ?? buildAlbumZipFilename(albumTitle)
  await save(filename, entries)
  return { count: entries.length, failed, filename }
}
