/** Fixed locale so SSR (Node) and the browser produce identical text. */
const GALLERY_DATE_LOCALE = "en-US"

export function formatUploadedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(GALLERY_DATE_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatUploadedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(GALLERY_DATE_LOCALE, {
    dateStyle: "medium",
  })
}
