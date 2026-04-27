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
    throw new Error("沒有可下載的檔案")
  }
  const inputs = entries.map((e) => ({ name: e.name, input: e.blob }))
  const blob = await downloadZip(inputs).blob()
  triggerDownload(blob, filename)
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

const UNSAFE_NAME_CHARS = /[\\/:*?"<>|\s]/g

export function safeFolderName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARS, "_").trim()
  return cleaned.length > 0 ? cleaned : "unknown"
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
