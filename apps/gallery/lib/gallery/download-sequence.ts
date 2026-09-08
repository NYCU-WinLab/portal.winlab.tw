"use client"

import { mapPool } from "@/lib/gallery/map-pool"
import { getGalleryImageUrl } from "@/lib/gallery/url"
import { saveZip, type ZipEntry } from "@/lib/gallery/zip"
import {
  buildSequenceEntryName,
  buildSequenceZipFilename,
  SEQUENCE_ZIP_MAX_ITEMS,
  sortSequenceZipItems,
  type SequenceZipSource,
} from "@/lib/gallery/zip-names"

export type DownloadSequenceProgress = {
  completed: number
  total: number
}

export type DownloadSequenceZipOptions = {
  zipName?: string
  concurrency?: number
  onProgress?: (progress: DownloadSequenceProgress) => void
  /** Override public URL builder (tests). */
  resolveUrl?: (imagePath: string) => string
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch
  /** Override ZIP write (tests). */
  save?: (filename: string, entries: ZipEntry[]) => Promise<void>
}

/**
 * Fetch each sequence original from the public gallery bucket and save a ZIP.
 * Prefers client-side zip (same pattern as trip) — no Route Handler.
 */
export async function downloadSequenceZip(
  items: SequenceZipSource[],
  options: DownloadSequenceZipOptions = {}
): Promise<{ count: number; filename: string }> {
  if (items.length === 0) {
    throw new Error("This story has no shots to download")
  }
  if (items.length > SEQUENCE_ZIP_MAX_ITEMS) {
    throw new Error(
      `Stories longer than ${SEQUENCE_ZIP_MAX_ITEMS} shots need to be split first`
    )
  }

  const ordered = sortSequenceZipItems(items)
  const concurrency = Math.max(1, options.concurrency ?? 3)
  const resolveUrl = options.resolveUrl ?? getGalleryImageUrl
  const fetchImpl = options.fetchImpl ?? fetch
  const save = options.save ?? saveZip
  const used = new Set<string>()
  const planned = ordered.map((item, index) => ({
    item,
    name: buildSequenceEntryName(used, index, item),
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
          `Could not fetch shot ${index + 1} (${response.status})`
        )
      }
      const blob = await response.blob()
      completed += 1
      options.onProgress?.({ completed, total })
      return { name, blob }
    }
  )

  const coverName = ordered[0]?.name ?? "story"
  const filename = options.zipName ?? buildSequenceZipFilename(coverName)
  await save(filename, entries)
  return { count: entries.length, filename }
}
