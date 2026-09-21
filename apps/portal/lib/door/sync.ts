// The two jobs that compare door_cards against the controller: a one-off
// import for the initial bootstrap, and the reconcile that both the
// "與卡機比對" button and the nightly cron run.
//
// They live here rather than in the server action because the cron route
// handler needs the same code path, and a reconcile that only ever ran when
// someone had the page open would miss exactly the overnight corruption this
// whole feature exists to catch.

import { diffControllerCards } from "@/lib/door/cards"
import { recordDoorCardChange, type DoorCardActor } from "@/lib/door/card-audit"
import { listDoorCardRows } from "@/lib/door/card-store"
import { fetchControllerCardList } from "@/lib/door/hams"
import { createAdminClient } from "@/lib/supabase/admin"

// The controller holds a few dozen cards. A count anywhere near this is the
// signature of the corruption that motivated #1192 — the device claimed 10,240
// cards while only 10 were readable — so it gets flagged even when nothing
// else drifted.
export const CARD_COUNT_ALARM = 200

export type ReconcileResult = {
  synced: number
  missing_on_controller: number
  unknown_on_controller: number
  controller_card_count: number
  drifted: boolean
}

export type ImportResult = {
  imported: number
  skipped: number
  controller_card_count: number
}

// Audits itself, on both the success and the failure path, and then rethrows.
// Unlike the single-card actions this is not on a latency-sensitive path, so
// the write is awaited rather than deferred to after().
export async function reconcileControllerCards(
  actor: DoorCardActor,
  headers?: Headers
): Promise<ReconcileResult> {
  const started = performance.now()
  const admin = createAdminClient()

  try {
    const list = await fetchControllerCardList()
    const rows = await listDoorCardRows(admin)
    const diff = diffControllerCards(rows, list.cards)
    const seenAt = new Date().toISOString()

    if (diff.synced.length > 0) {
      const { error } = await admin
        .from("door_cards")
        .update({ sync_state: "synced", last_seen_at: seenAt })
        .in("card_id", diff.synced)
      if (error) throw new Error(error.message)
    }

    if (diff.missingOnController.length > 0) {
      const { error } = await admin
        .from("door_cards")
        .update({ sync_state: "missing_on_controller" })
        .in("card_id", diff.missingOnController)
      if (error) throw new Error(error.message)
    }

    const drifted =
      diff.missingOnController.length > 0 ||
      diff.unknownOnController.length > 0 ||
      list.count > CARD_COUNT_ALARM

    const result: ReconcileResult = {
      synced: diff.synced.length,
      missing_on_controller: diff.missingOnController.length,
      unknown_on_controller: diff.unknownOnController.length,
      controller_card_count: list.count,
      drifted,
    }

    await recordDoorCardChange({
      actor,
      action: "reconcile",
      cardId: null,
      headers,
      severity: drifted ? "ERROR" : "INFO",
      body: drifted ? "door card list drifted" : "door card list reconciled",
      outcome: {
        ok: !drifted,
        error: drifted ? describeDrift(result) : null,
        latencyMs: performance.now() - started,
        detail: {
          ...result,
          missing_ids: diff.missingOnController,
          unknown_ids: diff.unknownOnController,
        },
      },
    })

    return result
  } catch (err) {
    await recordDoorCardChange({
      actor,
      action: "reconcile",
      cardId: null,
      headers,
      severity: "ERROR",
      body: "door card reconcile failed",
      outcome: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: performance.now() - started,
      },
    })
    throw err
  }
}

function describeDrift(result: ReconcileResult): string {
  const parts: string[] = []
  if (result.missing_on_controller > 0)
    parts.push(`${result.missing_on_controller} missing on controller`)
  if (result.unknown_on_controller > 0)
    parts.push(`${result.unknown_on_controller} unknown on controller`)
  if (result.controller_card_count > CARD_COUNT_ALARM)
    parts.push(`controller reports ${result.controller_card_count} cards`)
  return parts.join(", ")
}

// Bootstrap: adopt every card the controller already holds that door_cards has
// never heard of. The controller's name becomes the holder name, which is all
// the device stores; the admin fills in the portal account and the note
// afterwards. Cards already in door_cards are left untouched — the portal's
// copy is the richer one.
export async function importControllerCards(
  actor: DoorCardActor,
  headers?: Headers
): Promise<ImportResult> {
  const started = performance.now()
  const admin = createAdminClient()

  try {
    const list = await fetchControllerCardList()
    const rows = await listDoorCardRows(admin)
    const known = new Set(rows.map((r) => r.card_id))
    const seenAt = new Date().toISOString()

    const toInsert = list.cards
      .filter((card) => !known.has(card.card_id))
      .map((card) => ({
        card_id: card.card_id,
        holder_name: card.name,
        sync_state: "synced",
        last_seen_at: seenAt,
        created_by: actor?.id ?? null,
      }))

    if (toInsert.length > 0) {
      const { error } = await admin.from("door_cards").insert(toInsert)
      if (error) throw new Error(error.message)
    }

    const result: ImportResult = {
      imported: toInsert.length,
      skipped: list.cards.length - toInsert.length,
      controller_card_count: list.count,
    }

    await recordDoorCardChange({
      actor,
      action: "import",
      cardId: null,
      headers,
      body: "door cards imported from controller",
      outcome: {
        ok: true,
        latencyMs: performance.now() - started,
        detail: { ...result, imported_ids: toInsert.map((c) => c.card_id) },
      },
    })

    return result
  } catch (err) {
    await recordDoorCardChange({
      actor,
      action: "import",
      cardId: null,
      headers,
      severity: "ERROR",
      body: "door card import failed",
      outcome: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: performance.now() - started,
      },
    })
    throw err
  }
}
