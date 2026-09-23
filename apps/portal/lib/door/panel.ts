// Server-only client for the lab's LED panel service (display.winlab.tw, on
// the lab pve host, driving the 32x32 panel over BLE). It is a separate
// service from the door relay, with its own URL and token:
//   POST /api/greet  {"name": string, "seconds": number}  -> 202
// The service owns the name rules (family-first Han, Latin first word, length
// caps) and the font, so Portal sends the raw name. Both env vars are optional
// and server-only; unset means no panel.

export type GreetPanelOptions = {
  seconds?: number
  timeoutMs?: number
}

// "skipped" is an unconfigured panel. Any non-2xx, network error or timeout
// is "failed".
export type GreetPanelResult = "shown" | "skipped" | "failed"

// A display name is a few words; anything longer is not a name, and the
// panel shows at most 8 characters of it anyway.
const MAX_NAME_LENGTH = 64

export function panelConfigured(): boolean {
  return Boolean(process.env.DISPLAY_API_URL && process.env.DISPLAY_API_SECRET)
}

let reportedUnconfigured = false

// Cosmetic, so it never throws: it runs after an unlock has already succeeded
// and a dark panel must not turn that into an error.
export async function greetNameOnPanel(
  name: string,
  { seconds = 10, timeoutMs = 3000 }: GreetPanelOptions = {}
): Promise<GreetPanelResult> {
  const base = process.env.DISPLAY_API_URL
  const secret = process.env.DISPLAY_API_SECRET
  if (!base || !secret) {
    if (!reportedUnconfigured) {
      reportedUnconfigured = true
      console.debug("[door] panel not configured, skipping greeting")
    }
    return "skipped"
  }
  try {
    const trimmed = Array.from(name.trim()).slice(0, MAX_NAME_LENGTH).join("")
    if (!trimmed) return "skipped"
    const res = await fetch(`${base.replace(/\/$/, "")}/api/greet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: trimmed,
        seconds: Math.min(60, Math.max(1, Math.round(seconds))),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) return "shown"
    console.error(`[door] panel responded ${res.status}`)
    return "failed"
  } catch (err) {
    console.error("[door] panel request failed", err)
    return "failed"
  }
}
