export const TRIP_BUCKET = "trip-files"

export function tripFilePath(
  tripId: string,
  userId: string,
  fileId: string
): string {
  return `${tripId}/${userId}/${fileId}.pdf`
}

// Replace the original extension with .pdf for display / zip naming.
export function pdfDisplayName(originalName: string): string {
  const trimmed = originalName.replace(/\.[^.]+$/, "").trim()
  const safe = trimmed.length > 0 ? trimmed : "file"
  return `${safe}.pdf`
}
