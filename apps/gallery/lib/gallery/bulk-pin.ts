/** Cap bulk pin mutations so one request stays serverless-friendly. */
export const GALLERY_BULK_PIN_MAX = 50

export function normalizeGalleryPinImageIds(
  imageIds: string[] | null | undefined
): string[] {
  if (!imageIds?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of imageIds) {
    const id = typeof raw === "string" ? raw.trim() : ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= GALLERY_BULK_PIN_MAX) break
  }
  return out
}

export function describeBulkPinResult(input: {
  pinned: boolean
  ok: number
  failed: number
}): string {
  const verb = input.pinned ? "Pinned" : "Unpinned"
  if (input.failed === 0) {
    return `${verb} ${input.ok} photo${input.ok === 1 ? "" : "s"}.`
  }
  return `${verb} ${input.ok}; ${input.failed} failed.`
}
