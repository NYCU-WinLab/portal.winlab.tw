export type ZipDownloadToast = {
  severity: "success" | "warning"
  title: string
  description?: string
}

/** User-facing toast copy for a completed ZIP download (possibly partial). */
export function describeZipDownloadResult(input: {
  count: number
  failed: number
  noun: string
}): ZipDownloadToast {
  const { count, failed, noun } = input
  const plural = count === 1 ? noun : `${noun}s`
  const title = `Saved ${count} ${plural} as ZIP`
  if (failed <= 0) {
    return { severity: "success", title }
  }
  return {
    severity: "warning",
    title,
    description: `${failed} could not be fetched and ${failed === 1 ? "was" : "were"} skipped.`,
  }
}
