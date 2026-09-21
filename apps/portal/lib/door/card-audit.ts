// Audit trail for /door/admin: one record per attempt to change the controller
// card list, written to `door_card_changes` and mirrored as an OTel log record
// so Sensorium has it too. Server-only. Mirrors lib/door/audit.ts, which does
// the same job for door presses.

import type { Attributes } from "@opentelemetry/api"

import { maskCardId } from "@/lib/door/cards"
import { getClientAttributionAttributes } from "@/lib/otel/attribution"
import { emitLog } from "@/lib/otel/log"
import { createAdminClient } from "@/lib/supabase/admin"
import type { NormalizedUser } from "@/lib/user"

export type DoorCardAction =
  | "add"
  | "update"
  | "delete"
  | "import"
  | "reconcile"

// The nightly cron has no member behind it, so the actor is optional and the
// row records "cron" as the name rather than leaving the trail anonymous.
export type DoorCardActor = NormalizedUser | null

export type DoorCardOutcome = {
  ok: boolean
  error?: string | null
  latencyMs?: number | null
  detail?: Record<string, unknown> | null
}

export type DoorCardChangeInsert = {
  card_id: string | null
  action: DoorCardAction
  user_id: string | null
  user_email: string | null
  user_name: string
  ok: boolean
  error: string | null
  latency_ms: number | null
  detail: Record<string, unknown> | null
  client_address: string | null
  geo_city: string | null
}

export const CRON_ACTOR_NAME = "cron"

// Pure: turns one attempt into the row to store.
export function buildDoorCardChange(
  actor: DoorCardActor,
  action: DoorCardAction,
  cardId: string | null,
  outcome: DoorCardOutcome,
  attribution: Attributes
): DoorCardChangeInsert {
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  return {
    card_id: cardId,
    action,
    user_id: actor?.id ?? null,
    user_email: actor?.email ?? null,
    user_name: actor?.name ?? CRON_ACTOR_NAME,
    ok: outcome.ok,
    error: outcome.ok ? null : (outcome.error ?? "card change failed"),
    latency_ms:
      typeof outcome.latencyMs === "number"
        ? Math.round(outcome.latencyMs)
        : null,
    detail: outcome.detail ?? null,
    client_address: str(attribution["client.address"]),
    geo_city: str(attribution["geo.city"]),
  }
}

// Same change as OTel attributes. Flat keys, semantic-convention names where
// one exists (`user.*`, `client.address`, `geo.*`, `error.message`).
export function doorCardChangeAttributes(
  change: DoorCardChangeInsert
): Attributes {
  const attrs: Attributes = {
    "door.card.action": change.action,
    "door.card.ok": change.ok,
    "user.name": change.user_name,
  }
  // Telemetry leaves the lab and is read by more people than the card list is.
  // The full number is a physical key, and it stays in the row.
  if (change.card_id) attrs["door.card.id"] = maskCardId(change.card_id)
  if (change.user_id) attrs["user.id"] = change.user_id
  if (change.user_email) attrs["user.email"] = change.user_email
  if (change.error) attrs["error.message"] = change.error
  if (change.latency_ms !== null) attrs["door.latency_ms"] = change.latency_ms
  if (change.client_address) attrs["client.address"] = change.client_address
  if (change.geo_city) attrs["geo.city"] = change.geo_city
  for (const [key, value] of Object.entries(change.detail ?? {})) {
    if (typeof value === "number" || typeof value === "boolean") {
      attrs[`door.card.${key}`] = value
    }
  }
  return attrs
}

// Write the row and emit the log record. Never throws: a lost audit line must
// not turn a card that was successfully added into an error toast, so failures
// go to the server console only.
export async function recordDoorCardChange(input: {
  actor: DoorCardActor
  action: DoorCardAction
  cardId: string | null
  outcome: DoorCardOutcome
  headers?: Headers
  severity?: "INFO" | "WARN" | "ERROR"
  body?: string
}): Promise<void> {
  try {
    const change = buildDoorCardChange(
      input.actor,
      input.action,
      input.cardId,
      input.outcome,
      input.headers ? getClientAttributionAttributes(input.headers) : {}
    )

    emitLog({
      severity: input.severity ?? (change.ok ? "INFO" : "ERROR"),
      body: input.body ?? `door card ${change.action}`,
      attributes: doorCardChangeAttributes(change),
    })

    const { error } = await createAdminClient()
      .from("door_card_changes")
      .insert(change)
    if (error) console.error("[door] card audit insert failed", error.message)
  } catch (err) {
    console.error("[door] card audit record failed", err)
  }
}
