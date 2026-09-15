// Server-only client for the lab door relay (ESP32-C3 behind door.winlab.tw).
// The device speaks a tiny token-protected HTTP API:
//   GET  /api/state         -> { open: boolean }
//   POST /api/open          -> { open: true }
//   POST /api/close         -> { open: false }
//   POST /api/pulse?ms=500  -> { open: false, pulsed_ms: number }  (newer firmware)
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
  method: "GET" | "POST"
): Promise<Response> {
  const base = process.env.DOOR_API_URL
  const secret = process.env.DOOR_API_SECRET
  if (!base || !secret) throw new Error("Door API is not configured")

  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
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
