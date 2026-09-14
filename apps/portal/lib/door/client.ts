// Server-only client for the lab door relay (ESP32-C3 behind door.winlab.tw).
// The device speaks a tiny token-protected HTTP API:
//   GET  /api/state  -> { open: boolean }
//   POST /api/open   -> { open: true }
//   POST /api/close  -> { open: false }
// Both env vars are server-only; the bearer token must never reach the browser.

export type DoorState = { open: boolean }

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

async function call(path: string, method: "GET" | "POST"): Promise<DoorState> {
  const base = process.env.DOOR_API_URL
  const secret = process.env.DOOR_API_SECRET
  if (!base || !secret) throw new Error("Door API is not configured")

  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Door API responded ${res.status}`)
  return parseDoorState(await res.json())
}

export function fetchDoorState(): Promise<DoorState> {
  return call("/api/state", "GET")
}

export function setDoorOpen(open: boolean): Promise<DoorState> {
  return call(open ? "/api/open" : "/api/close", "POST")
}
