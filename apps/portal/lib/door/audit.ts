// Audit trail for /door: one record per press, written to `door_events` and
// mirrored as an OTel log record so Sensorium has it too. Server-only.

import type { Attributes } from "@opentelemetry/api"

import { getClientAttributionAttributes } from "@/lib/otel/attribution"
import { emitLog } from "@/lib/otel/log"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { NormalizedUser } from "@/lib/user"

export type DoorOutcome =
  | { ok: true; latencyMs: number }
  | { ok: false; latencyMs: number; error: string }

export type DoorEvent = {
  id: string
  created_at: string
  user_id: string
  user_email: string | null
  user_name: string
  ok: boolean
  error: string | null
  latency_ms: number | null
  client_address: string | null
  geo_city: string | null
}

// Rows are inserted by the service-role client, so this shape is the whole
// contract with the table — keep it in step with the migration.
export type DoorEventInsert = Omit<DoorEvent, "id" | "created_at">

// Pure: turns a press into the row to store. `attribution` is the
// `client.address` / `geo.*` set from lib/otel/attribution, already free of
// anything secret.
export function buildDoorEvent(
  user: NormalizedUser,
  outcome: DoorOutcome,
  attribution: Attributes
): DoorEventInsert {
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  return {
    user_id: user.id,
    user_email: user.email,
    user_name: user.name,
    ok: outcome.ok,
    error: outcome.ok ? null : outcome.error || "Door API request failed",
    latency_ms: Math.round(outcome.latencyMs),
    client_address: str(attribution["client.address"]),
    geo_city: str(attribution["geo.city"]),
  }
}

// Same event as OTel attributes. Flat keys, semantic-convention names where
// one exists (`user.*`, `client.address`, `geo.*`, `error.message`).
export function doorEventAttributes(event: DoorEventInsert): Attributes {
  const attrs: Attributes = {
    "door.action": "open",
    "door.ok": event.ok,
    "user.id": event.user_id,
    "user.name": event.user_name,
  }
  if (event.user_email) attrs["user.email"] = event.user_email
  if (event.error) attrs["error.message"] = event.error
  if (event.latency_ms !== null) attrs["door.latency_ms"] = event.latency_ms
  if (event.client_address) attrs["client.address"] = event.client_address
  if (event.geo_city) attrs["geo.city"] = event.geo_city
  return attrs
}

// Write the row and emit the log record. Never throws: a lost audit line
// must not turn a successful unlock into an error toast, so failures go to
// the server console only.
export async function recordDoorEvent(
  user: NormalizedUser,
  outcome: DoorOutcome,
  headers: Headers
): Promise<void> {
  try {
    const event = buildDoorEvent(
      user,
      outcome,
      getClientAttributionAttributes(headers)
    )

    emitLog({
      severity: event.ok ? "INFO" : "WARN",
      body: event.ok ? "door opened" : "door open failed",
      attributes: doorEventAttributes(event),
    })

    const { error } = await createAdminClient()
      .from("door_events")
      .insert(event)
    if (error) console.error("[door] audit insert failed", error.message)
  } catch (err) {
    console.error("[door] audit record failed", err)
  }
}

// Newest first. RLS limits this to portal admins; anyone else gets an empty
// list, so callers gate the page on `is_portal_admin` themselves rather than
// reading "no rows" as "no events".
export async function listDoorEvents(limit = 100): Promise<DoorEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("door_events")
    .select(
      "id, created_at, user_id, user_email, user_name, ok, error, latency_ms, client_address, geo_city"
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data
}
