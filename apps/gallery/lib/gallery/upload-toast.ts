/** Toast after a successful multi-file gallery upload. */
export function describeUploadWorksToast(successCount: number): string {
  const suffix = successCount === 1 ? "" : "s"
  return `Uploaded ${successCount} work${suffix}.`
}
