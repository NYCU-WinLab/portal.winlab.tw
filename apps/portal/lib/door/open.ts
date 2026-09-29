import { after } from "next/server"

import { recordDoorEvent, type DoorSource } from "@/lib/door/audit"
import { pulseDoor, type DoorState } from "@/lib/door/client"
import { greetOnPanel } from "@/lib/door/greet"
import type { NormalizedUser } from "@/lib/user"

// One press of the door button, from /door or from an agent: a short relay
// pulse, then, after the response, the audit row for every attempt and the
// member's name on the LED panel for a success. Both callers share it so an
// agent's unlock leaves exactly the trail a tap does, marked with its source.
export async function pressDoor(
  user: NormalizedUser,
  requestHeaders: Headers,
  source: DoorSource
): Promise<DoorState> {
  const started = performance.now()
  try {
    const state = await pulseDoor()
    const latencyMs = performance.now() - started
    after(() =>
      recordDoorEvent(user, { ok: true, latencyMs }, requestHeaders, source)
    )
    after(() => greetOnPanel({ userId: user.id, fallbackName: user.name }))
    return state
  } catch (err) {
    const latencyMs = performance.now() - started
    const error = err instanceof Error ? err.message : "Door API request failed"
    after(() =>
      recordDoorEvent(
        user,
        { ok: false, latencyMs, error },
        requestHeaders,
        source
      )
    )
    throw err
  }
}
