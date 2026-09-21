"use server"

// The browser never talks to the door device. These actions run on the server
// with the bearer token from the environment, so the token stays out of the
// client bundle and the device only has to trust one caller.

import { headers } from "next/headers"
import { after } from "next/server"

import { recordDoorEvent } from "@/lib/door/audit"
import {
  doorConfigured,
  fetchDoorState,
  pulseDoor,
  type DoorState,
} from "@/lib/door/client"
import { getCurrentUser, type NormalizedUser } from "@/lib/user"

export type DoorResult =
  | { ok: true; state: DoorState }
  | { ok: false; error: string }

async function guarded(
  run: (user: NormalizedUser) => Promise<DoorState>
): Promise<DoorResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Unauthorized" }
  if (!doorConfigured())
    return { ok: false, error: "Door API is not configured" }
  try {
    return { ok: true, state: await run(user) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Door API request failed",
    }
  }
}

export async function getDoorState(): Promise<DoorResult> {
  return guarded(fetchDoorState)
}

// One-shot unlock: a short relay pulse. The access controller decides how long
// the door actually stays unlocked. Every attempt, successful or not, is
// written to the audit trail after the response goes out so the press never
// waits on the database.
export async function openDoor(): Promise<DoorResult> {
  return guarded(async (user) => {
    const requestHeaders = await headers()
    const started = performance.now()
    try {
      const state = await pulseDoor()
      const latencyMs = performance.now() - started
      after(() =>
        recordDoorEvent(user, { ok: true, latencyMs }, requestHeaders)
      )
      return state
    } catch (err) {
      const latencyMs = performance.now() - started
      const error =
        err instanceof Error ? err.message : "Door API request failed"
      after(() =>
        recordDoorEvent(user, { ok: false, latencyMs, error }, requestHeaders)
      )
      throw err
    }
  })
}
