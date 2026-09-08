"use client"

import { getGalleryImageUrl } from "@/lib/gallery/url"
import { ensureExtension, safeFolderName } from "@/lib/gallery/zip-names"
import { triggerDownload } from "@/lib/gallery/zip"

export type DownloadOriginalOptions = {
  displayName: string
  imagePath: string
  resolveUrl?: (imagePath: string) => string
  fetchImpl?: (input: string) => Promise<Response>
  save?: (blob: Blob, filename: string) => void
}

/**
 * Fetch the public gallery original and force a local save.
 * Cross-origin `<a download>` is unreliable — blob + object URL matches ZIP.
 */
export async function downloadGalleryOriginal(
  options: DownloadOriginalOptions
): Promise<{ filename: string }> {
  const imagePath = options.imagePath.trim()
  if (!imagePath) {
    throw new Error("This photo has no downloadable file")
  }

  const resolveUrl = options.resolveUrl ?? getGalleryImageUrl
  const fetchImpl = options.fetchImpl ?? fetch
  const save = options.save ?? triggerDownload

  const response = await fetchImpl(resolveUrl(imagePath))
  if (!response.ok) {
    throw new Error(`Could not fetch original (${response.status})`)
  }

  const blob = await response.blob()
  const filename = safeFolderName(
    ensureExtension(options.displayName, imagePath)
  )
  save(blob, filename)
  return { filename }
}
