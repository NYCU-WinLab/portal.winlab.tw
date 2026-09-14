"use server"

// The browser never talks to the door device. These actions run on the server
// with the bearer token from the environment, so the token stays out of the
// client bundle and the device only has to trust one caller.

import {
  doorConfigured,
  fetchDoorState,
  setDoorOpen,
  type DoorState,
} from "@/lib/door/client"
import { getCurrentUser } from "@/lib/user"

export type DoorResult =
  | { ok: true; state: DoorState }
  | { ok: false; error: string }

async function guarded(run: () => Promise<DoorState>): Promise<DoorResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Unauthorized" }
  if (!doorConfigured())
    return { ok: false, error: "Door API is not configured" }
  try {
    return { ok: true, state: await run() }
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

export async function openDoor(): Promise<DoorResult> {
  return guarded(() => setDoorOpen(true))
}

export async function closeDoor(): Promise<DoorResult> {
  return guarded(() => setDoorOpen(false))
}
