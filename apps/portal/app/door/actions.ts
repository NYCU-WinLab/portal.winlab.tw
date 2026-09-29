"use server"

// The browser never talks to the door device. These actions run on the server
// with the bearer token from the environment, so the token stays out of the
// client bundle and the device only has to trust one caller.

import { headers } from "next/headers"

import {
  doorConfigured,
  fetchDoorState,
  type DoorState,
} from "@/lib/door/client"
import { pressDoor } from "@/lib/door/open"
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
// waits on the database. A successful press also puts the member's name on
// the door's LED panel, on the same deferred path.
export async function openDoor(): Promise<DoorResult> {
  return guarded(async (user) => pressDoor(user, await headers(), "web"))
}
