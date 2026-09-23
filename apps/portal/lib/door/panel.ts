// Server-only client for the lab's LED panel bridge (display.winlab.tw, a
// service on the lab pve host that drives the 32x32 panel over BLE). It is a
// separate service from the door relay, with its own URL and token:
//   POST /api/show?s=10&c=ffffff, body = 128-byte 32x32 bitmap -> 202
// Both env vars are optional and server-only; unset means no panel.

export const PANEL_BITMAP_BYTES = 128

export type ShowOptions = {
  seconds?: number
  color?: string
  timeoutMs?: number
}

// "skipped" is an unconfigured panel. Any non-2xx, network error or timeout
// is "failed".
export type ShowResult = "shown" | "skipped" | "failed"

export function panelConfigured(): boolean {
  return Boolean(process.env.DISPLAY_API_URL && process.env.DISPLAY_API_SECRET)
}

let reportedUnconfigured = false

// Puts a 32x32 1-bit bitmap on the panel. Cosmetic, so it never throws: it
// runs after an unlock has already succeeded and a dark panel must not turn
// that into an error.
export async function showOnPanel(
  bitmap: Uint8Array,
  { seconds = 10, color = "ffffff", timeoutMs = 3000 }: ShowOptions = {}
): Promise<ShowResult> {
  const base = process.env.DISPLAY_API_URL
  const secret = process.env.DISPLAY_API_SECRET
  if (!base || !secret) {
    if (!reportedUnconfigured) {
      reportedUnconfigured = true
      console.debug("[door] panel not configured, skipping display")
    }
    return "skipped"
  }
  try {
    if (bitmap.length !== PANEL_BITMAP_BYTES) {
      throw new Error(`bitmap is ${bitmap.length} bytes, expected 128`)
    }
    if (!/^[0-9a-f]{6}$/i.test(color)) throw new Error(`bad color ${color}`)
    const s = Math.min(60, Math.max(1, Math.round(seconds)))
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/show?s=${s}&c=${color.toLowerCase()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(bitmap),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      }
    )
    if (res.ok) return "shown"
    console.error(`[door] panel responded ${res.status}`)
    return "failed"
  } catch (err) {
    console.error("[door] panel request failed", err)
    return "failed"
  }
}
