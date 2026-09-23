// Server-only client for the lab door relay (ESP32-C3 behind door.winlab.tw).
// The device speaks a tiny token-protected HTTP API:
//   GET  /api/state         -> { open: boolean }
//   POST /api/open          -> { open: true }
//   POST /api/close         -> { open: false }
//   POST /api/pulse?ms=500  -> { open: false, pulsed_ms: number }  (newer firmware)
//   POST /api/show?s=10&c=ffffff, body = 128-byte 32x32 bitmap -> 202 (newer firmware)
// The access controller owns the unlock time, so the relay only needs a short
// contact closure. Both env vars are server-only; the bearer token must never
// reach the browser.

export type DoorState = { open: boolean }

export const PULSE_MS = 500
const CLOSE_RETRIES = 3

export function doorConfigured(): boolean {
  return Boolean(process.env.DOOR_API_URL && process.env.DOOR_API_SECRET)
}

export function parseDoorState(payload: unknown): DoorState {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { open?: unknown }).open !== "boolean"
  ) {
    throw new Error("Door API returned an unexpected payload")
  }
  return { open: (payload as { open: boolean }).open }
}

async function request(
  path: string,
  method: "GET" | "POST",
  { body, timeoutMs = 8000 }: { body?: Uint8Array; timeoutMs?: number } = {}
): Promise<Response> {
  const base = process.env.DOOR_API_URL
  const secret = process.env.DOOR_API_SECRET
  if (!base || !secret) throw new Error("Door API is not configured")

  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` }
  if (body) headers["Content-Type"] = "application/octet-stream"
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  })
}

async function call(path: string, method: "GET" | "POST"): Promise<DoorState> {
  const res = await request(path, method)
  if (!res.ok) throw new Error(`Door API responded ${res.status}`)
  return parseDoorState(await res.json())
}

export function fetchDoorState(): Promise<DoorState> {
  return call("/api/state", "GET")
}

export function setDoorOpen(open: boolean): Promise<DoorState> {
  return call(open ? "/api/open" : "/api/close", "POST")
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One-shot contact closure. Prefers the device's own /api/pulse, which times
// the closure on the board; falls back to open -> wait -> close for firmware
// without it. The fallback retries the close so a dropped request cannot leave
// the relay engaged.
export async function pulseDoor(ms: number = PULSE_MS): Promise<DoorState> {
  const native = await request(`/api/pulse?ms=${ms}`, "POST")
  if (native.ok) return parseDoorState(await native.json())
  if (native.status !== 404) {
    throw new Error(`Door API responded ${native.status}`)
  }

  await setDoorOpen(true)
  await sleep(ms)
  let lastError: unknown
  for (let attempt = 0; attempt < CLOSE_RETRIES; attempt++) {
    try {
      return await setDoorOpen(false)
    } catch (err) {
      lastError = err
      await sleep(200)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Door relay did not release")
}

export const SHOW_BITMAP_BYTES = 128

export type ShowOptions = {
  seconds?: number
  color?: string
  timeoutMs?: number
}

// "unsupported" is firmware without /api/show (404). Anything else that is
// not a 2xx, and any network error or timeout, is "failed".
export type ShowResult = "shown" | "unsupported" | "failed"

// Puts a 32x32 1-bit bitmap on the door's LED panel. Cosmetic, so it never
// throws: it runs after an unlock has already succeeded and a dark panel must
// not turn that into an error.
export async function showOnDoor(
  bitmap: Uint8Array,
  { seconds = 10, color = "ffffff", timeoutMs = 3000 }: ShowOptions = {}
): Promise<ShowResult> {
  try {
    if (bitmap.length !== SHOW_BITMAP_BYTES) {
      throw new Error(`bitmap is ${bitmap.length} bytes, expected 128`)
    }
    if (!/^[0-9a-f]{6}$/i.test(color)) throw new Error(`bad color ${color}`)
    const s = Math.min(60, Math.max(1, Math.round(seconds)))
    const res = await request(
      `/api/show?s=${s}&c=${color.toLowerCase()}`,
      "POST",
      { body: bitmap, timeoutMs }
    )
    if (res.ok) return "shown"
    if (res.status === 404) {
      console.warn("[door] display skipped: firmware has no /api/show")
      return "unsupported"
    }
    console.error(`[door] display failed: Door API responded ${res.status}`)
    return "failed"
  } catch (err) {
    console.error("[door] display failed", err)
    return "failed"
  }
}
