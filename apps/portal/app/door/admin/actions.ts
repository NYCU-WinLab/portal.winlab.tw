"use server"

// The browser never talks to hams-bridge, and the bridge never talks to
// Supabase. These actions are the only place the two meet: check the role,
// change the controller, then write down what happened. The order matters —
// the controller is the thing that actually opens the door, so door_cards is
// only updated once the bridge has confirmed the change on the device.

import { headers } from "next/headers"
import { after } from "next/server"

import {
  recordDoorCardChange,
  type DoorCardAction,
} from "@/lib/door/card-audit"
import { getDoorCardRow, listDoorCardRows } from "@/lib/door/card-store"
import {
  hamsErrorMessage,
  mergeDoorCards,
  validateCardId,
  validateHolderName,
  type DoorCardView,
} from "@/lib/door/cards"
import {
  createControllerCard,
  deleteControllerCard,
  fetchControllerCards,
  fetchControllerHealth,
  hamsConfigured,
  HamsError,
  renameControllerCard,
  type ControllerHealth,
} from "@/lib/door/hams"
import {
  importControllerCards,
  reconcileControllerCards,
} from "@/lib/door/sync"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser, type NormalizedUser } from "@/lib/user"

export type DoorCardsResult =
  | { ok: true; cards: DoorCardView[]; controllerError: string | null }
  | { ok: false; error: string }

export type ControllerHealthResult =
  | { ok: true; health: ControllerHealth }
  | { ok: false; error: string }

export type DoorCardMutation =
  | { ok: true; message: string }
  | { ok: false; error: string }

export type DoorCardInput = {
  card_id: string
  holder_name: string
  holder_user_id?: string | null
  note?: string | null
}

export type DoorCardPatch = {
  holder_name?: string
  holder_user_id?: string | null
  note?: string | null
}

// Every action starts here. RLS already hides the rows, but the bridge calls
// have no RLS at all, so the role check is the gate that keeps a member from
// rewriting the controller through a hand-made request.
async function requireDoorAdmin(): Promise<NormalizedUser> {
  const supabase = await createClient()
  const { data: isAdmin, error } = await supabase.rpc("is_door_admin")
  if (error) throw new Error(error.message)
  if (!isAdmin) throw new Error("Forbidden")
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

function describe(err: unknown): string {
  if (err instanceof HamsError)
    return hamsErrorMessage(err.code, err.message || "卡機橋接服務沒有回應。")
  if (err instanceof Error) return err.message
  return "未知錯誤"
}

function auditFailure(
  user: NormalizedUser,
  action: DoorCardAction,
  cardId: string | null,
  err: unknown,
  latencyMs: number,
  requestHeaders: Headers
) {
  after(() =>
    recordDoorCardChange({
      actor: user,
      action,
      cardId,
      headers: requestHeaders,
      severity: "ERROR",
      body: `door card ${action} failed`,
      outcome: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs,
        detail: err instanceof HamsError ? { code: err.code } : null,
      },
    })
  )
}

export async function listDoorCards(): Promise<DoorCardsResult> {
  try {
    await requireDoorAdmin()
    const supabase = await createClient()
    const rows = await listDoorCardRows(supabase)

    if (!hamsConfigured()) {
      return {
        ok: true,
        cards: mergeDoorCards(rows, null),
        controllerError: "卡機橋接服務尚未設定（HAMS_API_URL）。",
      }
    }

    // A dead bridge must not blank the page: the stored list is still the best
    // answer to "who has a card", it just cannot be checked right now.
    try {
      const controller = await fetchControllerCards()
      return {
        ok: true,
        cards: mergeDoorCards(rows, controller),
        controllerError: null,
      }
    } catch (err) {
      return {
        ok: true,
        cards: mergeDoorCards(rows, null),
        controllerError: describe(err),
      }
    }
  } catch (err) {
    return { ok: false, error: describe(err) }
  }
}

export async function getControllerHealth(): Promise<ControllerHealthResult> {
  try {
    await requireDoorAdmin()
    if (!hamsConfigured())
      return { ok: false, error: "卡機橋接服務尚未設定（HAMS_API_URL）。" }
    return { ok: true, health: await fetchControllerHealth() }
  } catch (err) {
    return { ok: false, error: describe(err) }
  }
}

export async function addDoorCard(
  input: DoorCardInput
): Promise<DoorCardMutation> {
  const requestHeaders = await headers()
  const started = performance.now()
  let user: NormalizedUser
  try {
    user = await requireDoorAdmin()
  } catch (err) {
    return { ok: false, error: describe(err) }
  }

  const cardId = input.card_id.trim()
  const holderName = input.holder_name.trim()
  const invalid = validateCardId(cardId) ?? validateHolderName(holderName)
  if (invalid) return { ok: false, error: invalid }

  try {
    const result = await createControllerCard(cardId, holderName)

    const { error } = await createAdminClient()
      .from("door_cards")
      .insert({
        card_id: cardId,
        holder_name: holderName,
        holder_user_id: input.holder_user_id || null,
        note: input.note?.trim() || null,
        sync_state: "synced",
        last_seen_at: new Date().toISOString(),
        created_by: user.id,
      })
    if (error) throw new Error(error.message)

    const latencyMs = performance.now() - started
    after(() =>
      recordDoorCardChange({
        actor: user,
        action: "add",
        cardId,
        headers: requestHeaders,
        outcome: {
          ok: true,
          latencyMs,
          detail: {
            holder_name: holderName,
            count_before: result.count_before,
            count_after: result.count_after,
          },
        },
      })
    )
    return { ok: true, message: `已新增 ${holderName} 的卡片。` }
  } catch (err) {
    auditFailure(
      user,
      "add",
      cardId,
      err,
      performance.now() - started,
      requestHeaders
    )
    return { ok: false, error: describe(err) }
  }
}

export async function updateDoorCard(
  cardId: string,
  patch: DoorCardPatch
): Promise<DoorCardMutation> {
  const requestHeaders = await headers()
  const started = performance.now()
  let user: NormalizedUser
  try {
    user = await requireDoorAdmin()
  } catch (err) {
    return { ok: false, error: describe(err) }
  }

  const holderName = patch.holder_name?.trim()
  if (holderName !== undefined) {
    const invalid = validateHolderName(holderName)
    if (invalid) return { ok: false, error: invalid }
  }

  try {
    const admin = createAdminClient()
    const existing = await getDoorCardRow(admin, cardId)
    if (!existing) throw new Error("這張卡不在名單裡，請先匯入卡機清單。")

    // The controller only stores the name, so a note or holder change is a
    // portal-side edit and must not touch the device.
    const renamed =
      holderName !== undefined && holderName !== existing.holder_name
    if (renamed) await renameControllerCard(cardId, holderName!)

    const { error } = await admin
      .from("door_cards")
      .update({
        ...(holderName !== undefined ? { holder_name: holderName } : {}),
        ...(patch.holder_user_id !== undefined
          ? { holder_user_id: patch.holder_user_id || null }
          : {}),
        ...(patch.note !== undefined
          ? { note: patch.note?.trim() || null }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("card_id", cardId)
    if (error) throw new Error(error.message)

    const latencyMs = performance.now() - started
    after(() =>
      recordDoorCardChange({
        actor: user,
        action: "update",
        cardId,
        headers: requestHeaders,
        outcome: {
          ok: true,
          latencyMs,
          detail: {
            renamed_on_controller: renamed,
            holder_name_before: existing.holder_name,
            holder_name_after: holderName ?? existing.holder_name,
          },
        },
      })
    )
    return { ok: true, message: "已更新卡片資料。" }
  } catch (err) {
    auditFailure(
      user,
      "update",
      cardId,
      err,
      performance.now() - started,
      requestHeaders
    )
    return { ok: false, error: describe(err) }
  }
}

export async function deleteDoorCard(
  cardId: string
): Promise<DoorCardMutation> {
  const requestHeaders = await headers()
  const started = performance.now()
  let user: NormalizedUser
  try {
    user = await requireDoorAdmin()
  } catch (err) {
    return { ok: false, error: describe(err) }
  }

  try {
    // not_found means the device no longer has this card, which is the state
    // the delete was asking for. Dropping the row anyway is what clears a
    // card that was already removed by hand in HAMS.
    let alreadyGone = false
    try {
      await deleteControllerCard(cardId)
    } catch (err) {
      if (err instanceof HamsError && err.code === "not_found")
        alreadyGone = true
      else throw err
    }

    const { error } = await createAdminClient()
      .from("door_cards")
      .delete()
      .eq("card_id", cardId)
    if (error) throw new Error(error.message)

    const latencyMs = performance.now() - started
    after(() =>
      recordDoorCardChange({
        actor: user,
        action: "delete",
        cardId,
        headers: requestHeaders,
        outcome: {
          ok: true,
          latencyMs,
          detail: { already_gone_on_controller: alreadyGone },
        },
      })
    )
    return {
      ok: true,
      message: alreadyGone
        ? "卡機上早就沒有這張卡，已從名單移除。"
        : "已刪除卡片。",
    }
  } catch (err) {
    auditFailure(
      user,
      "delete",
      cardId,
      err,
      performance.now() - started,
      requestHeaders
    )
    return { ok: false, error: describe(err) }
  }
}

export async function importFromController(): Promise<DoorCardMutation> {
  try {
    const user = await requireDoorAdmin()
    const requestHeaders = await headers()
    const result = await importControllerCards(user, requestHeaders)
    return {
      ok: true,
      message: `匯入 ${result.imported} 張卡，${result.skipped} 張已在名單裡。`,
    }
  } catch (err) {
    return { ok: false, error: describe(err) }
  }
}

export async function reconcileDoorCards(): Promise<DoorCardMutation> {
  try {
    const user = await requireDoorAdmin()
    const requestHeaders = await headers()
    const result = await reconcileControllerCards(user, requestHeaders)
    if (!result.drifted)
      return {
        ok: true,
        message: `卡機和名單一致，共 ${result.synced} 張卡。`,
      }
    return {
      ok: true,
      message: `對完了：卡機缺 ${result.missing_on_controller} 張、多 ${result.unknown_on_controller} 張，卡機回報 ${result.controller_card_count} 張。`,
    }
  } catch (err) {
    return { ok: false, error: describe(err) }
  }
}
