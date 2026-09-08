"use client"

import { downloadZip } from "client-zip"

export type ZipEntry = {
  name: string
  blob: Blob
}

export async function saveZip(
  filename: string,
  entries: ZipEntry[]
): Promise<void> {
  if (entries.length === 0) {
    throw new Error("Nothing to zip")
  }
  const inputs = entries.map((entry) => ({
    name: entry.name,
    input: entry.blob,
  }))
  const blob = await downloadZip(inputs).blob()
  triggerDownload(blob, filename)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
