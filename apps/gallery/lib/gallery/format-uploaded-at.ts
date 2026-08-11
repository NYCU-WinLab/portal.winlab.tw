/** Fixed locale so SSR (Node) and the browser produce identical text. */
const GALLERY_DATE_LOCALE = "en-US"

// Fixed timezone too: without it, `timeStyle`/`dateStyle` render a value that
// depends on the runtime tz. On Vercel the server runs in UTC while the
// browser is in the visitor's local tz, so the SSR text and the hydrated text
// disagree — that's the real React #418 (locale alone doesn't fix it). WinLab
// is in Taiwan, so pin Asia/Taipei on both sides.
const GALLERY_DATE_TIMEZONE = "Asia/Taipei"

export function formatUploadedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(GALLERY_DATE_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: GALLERY_DATE_TIMEZONE,
  })
}

export function formatUploadedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(GALLERY_DATE_LOCALE, {
    dateStyle: "medium",
    timeZone: GALLERY_DATE_TIMEZONE,
  })
}
