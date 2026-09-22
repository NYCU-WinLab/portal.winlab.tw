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
  planHolderCardWrites,
  validateCardId,
  validateHolderName,
  type DoorCardRow,
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

// Thrown when the reason is something the admin can act on. Everything else
// reaches the browser as GENERIC_ERROR: a Postgres message names columns and
// constraints the admin cannot do anything with, and it does not belong in a
// toast.
class DoorAdminError extends Error {}

const GENERIC_ERROR = "操作失敗了，請再試一次，若一直失敗請找管理員看 log。"

// Said when the controller took the change but the portal failed to write it
// down. The device is the thing that opens the door, so the change is real and
// the list on screen is the copy that is now wrong.
const CONTROLLER_AHEAD =
  "卡機已經改好了，但 Portal 沒記下來。請按「與卡機比對」把兩邊對回來。"

// Every action starts here. RLS already hides the rows, but the bridge calls
// have no RLS at all, so the role check is the gate that keeps a member from
// rewriting the controller through a hand-made request.
async function requireDoorAdmin(): Promise<NormalizedUser> {
  const supabase = await createClient()
  const { data: isAdmin, error } = await supabase.rpc("is_door_admin")
  if (error) throw new Error(error.message)
  if (!isAdmin) throw new DoorAdminError("你沒有門禁卡管理權限。")
  const user = await getCurrentUser()
  if (!user) throw new DoorAdminError("登入狀態過期了，請重新整理。")
  return user
}

function describe(err: unknown): string {
  if (err instanceof HamsError) return hamsErrorMessage(err.code, GENERIC_ERROR)
  if (err instanceof DoorAdminError) return err.message
  console.error("[door] card action failed", err)
  return GENERIC_ERROR
}

type FailureDetail = {
  controllerChanged: boolean
  counts?: ControllerCounts | null
}

function auditFailure(
  user: NormalizedUser,
  action: DoorCardAction,
  cardId: string | null,
  err: unknown,
  latencyMs: number,
  requestHeaders: Headers,
  failure: FailureDetail
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
        detail: {
          // Without this a half-applied change reads exactly like a no-op, and
          // the two need very different follow-up: one needs a retry, the
          // other needs someone to go look at the controller.
          controller_changed: failure.controllerChanged,
          ...(failure.counts ?? {}),
          ...(err instanceof HamsError
            ? { code: err.code, status: err.status }
            : {}),
        },
      },
    })
  )
}

type ControllerCounts = { count_before: number; count_after: number }

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

  let controllerChanged = false
  let counts: ControllerCounts | null = null

  try {
    const admin = createAdminClient()
    // A card that went missing from the controller keeps its row here, and
    // re-adding it is exactly what the rename_lost_card message tells the
    // admin to do. That row carries the holder link and the note, which the
    // controller never knew about and the add form cannot be expected to
    // retype, so they survive unless this call supplies something.
    const existing = await getDoorCardRow(admin, cardId)

    const result = await createControllerCard(cardId, holderName)
    controllerChanged = true
    counts = {
      count_before: result.count_before,
      count_after: result.count_after,
    }

    const now = new Date().toISOString()
    const { error } = await admin.from("door_cards").upsert(
      {
        card_id: cardId,
        holder_name: holderName,
        holder_user_id:
          input.holder_user_id?.trim() || existing?.holder_user_id || null,
        note: input.note?.trim() || existing?.note || null,
        sync_state: "synced",
        last_seen_at: now,
        updated_at: now,
        // Only on a genuine insert: re-adding a card does not make the person
        // who re-added it its creator.
        ...(existing ? {} : { created_by: user.id }),
      },
      { onConflict: "card_id" }
    )
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
            readded: existing !== null,
            previous: existing
              ? {
                  holder_name: existing.holder_name,
                  holder_user_id: existing.holder_user_id,
                  note: existing.note,
                  sync_state: existing.sync_state,
                }
              : null,
            ...counts,
          },
        },
      })
    )
    return {
      ok: true,
      message: existing
        ? `已把 ${holderName} 的卡片重新寫回卡機。`
        : `已新增 ${holderName} 的卡片。`,
    }
  } catch (err) {
    auditFailure(
      user,
      "add",
      cardId,
      err,
      performance.now() - started,
      requestHeaders,
      { controllerChanged, counts }
    )
    return {
      ok: false,
      error: controllerChanged ? CONTROLLER_AHEAD : describe(err),
    }
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

  const invalidId = validateCardId(cardId)
  if (invalidId) return { ok: false, error: invalidId }

  const holderName = patch.holder_name?.trim()
  if (holderName !== undefined) {
    const invalid = validateHolderName(holderName)
    if (invalid) return { ok: false, error: invalid }
  }

  let controllerChanged = false
  let counts: ControllerCounts | null = null

  try {
    const admin = createAdminClient()
    const existing = await getDoorCardRow(admin, cardId)
    if (!existing)
      throw new DoorAdminError("這張卡不在名單裡，請先匯入卡機清單。")

    // The controller only stores the name, so a note or holder change is a
    // portal-side edit and must not touch the device.
    const renamed =
      holderName !== undefined && holderName !== existing.holder_name

    if (renamed) {
      try {
        const result = await renameControllerCard(cardId, holderName!)
        controllerChanged = true
        counts = {
          count_before: result.count_before,
          count_after: result.count_after,
        }
      } catch (err) {
        if (err instanceof HamsError && err.code === "rename_lost_card") {
          // The device renames by deleting and re-adding. The delete landed
          // and the add did not, so the card no longer opens the door: say so
          // and mark the row, rather than leaving a row that claims "synced".
          const { error: markError } = await admin
            .from("door_cards")
            .update({
              sync_state: "missing_on_controller",
              updated_at: new Date().toISOString(),
            })
            .eq("card_id", cardId)
          if (markError)
            console.error("[door] marking lost card failed", markError.message)

          after(() =>
            recordDoorCardChange({
              actor: user,
              action: "update",
              cardId,
              headers: requestHeaders,
              severity: "ERROR",
              body: "door card rename lost the card",
              outcome: {
                ok: false,
                error: err.message,
                latencyMs: performance.now() - started,
                detail: {
                  controller_changed: true,
                  code: err.code,
                  observed: err.body?.observed ?? null,
                  // A failure here means the row still claims to be synced
                  // while the card no longer opens the door — the one state
                  // this page exists to make impossible.
                  mark_error: markError?.message ?? null,
                },
              },
            })
          )
          return {
            ok: false,
            error:
              hamsErrorMessage(err.code, GENERIC_ERROR) +
              (markError
                ? "（Portal 這邊也沒能更新狀態，請按「與卡機比對」）"
                : ""),
          }
        }
        throw err
      }
    }

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
            ...counts,
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
      requestHeaders,
      { controllerChanged, counts }
    )
    return {
      ok: false,
      error: controllerChanged ? CONTROLLER_AHEAD : describe(err),
    }
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

  const invalidId = validateCardId(cardId)
  if (invalidId) return { ok: false, error: invalidId }

  let controllerChanged = false
  let counts: ControllerCounts | null = null

  try {
    // not_found means the device no longer has this card, which is the state
    // the delete was asking for. Dropping the row anyway is what clears a
    // card that was already removed by hand in HAMS.
    let alreadyGone = false
    try {
      const result = await deleteControllerCard(cardId)
      controllerChanged = true
      counts = {
        count_before: result.count_before,
        count_after: result.count_after,
      }
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
          detail: { already_gone_on_controller: alreadyGone, ...counts },
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
      requestHeaders,
      { controllerChanged, counts }
    )
    return {
      ok: false,
      error: controllerChanged ? CONTROLLER_AHEAD : describe(err),
    }
  }
}

export async function importFromController(): Promise<DoorCardMutation> {
  try {
    const user = await requireDoorAdmin()
    const requestHeaders = await headers()
    const result = await importControllerCards(user, requestHeaders)
    return {
      ok: true,
      message:
        `匯入 ${result.imported} 張卡，${result.skipped} 張已在名單裡。` +
        (result.invalid > 0 ? `${result.invalid} 張卡號不合格式，跳過。` : ""),
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
    if (result.table_suspect)
      return {
        ok: false,
        error: `卡機回報 ${result.controller_card_count} 張卡，卡表疑似損毀，請先用 HAMS 重新上傳。名單沒有被改動。`,
      }
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

// ---- Holder-centric card editing ----
//
// The holder form saves a whole holder at once: a member (or guest) and the set
// of card numbers they hold. These actions diff the submitted set against the
// stored one and wrap the existing single-card actions in that loop, so the
// bridge / DB / audit logic stays in one place. Each card is written on its own
// and its outcome collected, so a partial failure keeps the writes that landed.

export type HolderCardOp = "add" | "remove" | "rename" | "update"

export type HolderCardOutcome = {
  cardId: string
  op: HolderCardOp
  ok: boolean
  message: string | null
  error: string | null
}

export type HolderCardsResult =
  | { ok: false; error: string }
  | { ok: true; results: HolderCardOutcome[] }

export type SaveHolderCardsInput = {
  holderUserId: string | null
  holderName: string
  note: string | null
  cardIds: string[]
  existingCardIds: string[]
}

function toOutcome(
  cardId: string,
  op: HolderCardOp,
  mutation: DoorCardMutation
): HolderCardOutcome {
  return mutation.ok
    ? { cardId, op, ok: true, message: mutation.message, error: null }
    : { cardId, op, ok: false, message: null, error: mutation.error }
}

export async function saveHolderCards(
  input: SaveHolderCardsInput
): Promise<HolderCardsResult> {
  try {
    await requireDoorAdmin()
  } catch (err) {
    return { ok: false, error: describe(err) }
  }

  const holderName = input.holderName.trim()
  const nameError = validateHolderName(holderName)
  if (nameError) return { ok: false, error: nameError }

  const submitted = [...new Set(input.cardIds.map((c) => c.trim()))].filter(
    (c) => c.length > 0
  )
  if (submitted.length === 0)
    return {
      ok: false,
      error: "至少要留一張卡片，否則請用「刪除」移除持有人。",
    }
  for (const cardId of submitted) {
    const invalid = validateCardId(cardId)
    if (invalid) return { ok: false, error: `卡號 ${cardId}：${invalid}` }
  }

  const holderUserId = input.holderUserId?.trim() || null
  const note = input.note?.trim() || null

  const admin = createAdminClient()
  const existing: DoorCardRow[] = []
  for (const cardId of [...new Set(input.existingCardIds)]) {
    const row = await getDoorCardRow(admin, cardId)
    if (row) existing.push(row)
  }

  const plan = planHolderCardWrites(existing, {
    cardIds: submitted,
    holderName,
    holderUserId,
    note,
  })

  const results: HolderCardOutcome[] = []

  // Drop cards first to free controller space, then rename (a device
  // delete-then-add), then add the newcomers; portal-only meta writes can go
  // whenever.
  for (const cardId of plan.remove) {
    results.push(toOutcome(cardId, "remove", await deleteDoorCard(cardId)))
  }
  for (const cardId of plan.rename) {
    results.push(
      toOutcome(
        cardId,
        "rename",
        await updateDoorCard(cardId, {
          holder_name: holderName,
          holder_user_id: holderUserId,
          note,
        })
      )
    )
  }
  for (const cardId of plan.updateMeta) {
    results.push(
      toOutcome(
        cardId,
        "update",
        await updateDoorCard(cardId, {
          holder_name: holderName,
          holder_user_id: holderUserId,
          note,
        })
      )
    )
  }
  for (const cardId of plan.add) {
    results.push(
      toOutcome(
        cardId,
        "add",
        await addDoorCard({
          card_id: cardId,
          holder_name: holderName,
          holder_user_id: holderUserId,
          note,
        })
      )
    )
  }

  return { ok: true, results }
}

export async function deleteHolderCards(
  cardIds: string[]
): Promise<HolderCardsResult> {
  try {
    await requireDoorAdmin()
  } catch (err) {
    return { ok: false, error: describe(err) }
  }

  const targets = [...new Set(cardIds.map((c) => c.trim()))].filter(
    (c) => c.length > 0
  )
  if (targets.length === 0) return { ok: false, error: "沒有要刪除的卡片。" }

  const results: HolderCardOutcome[] = []
  for (const cardId of targets) {
    results.push(toOutcome(cardId, "remove", await deleteDoorCard(cardId)))
  }
  return { ok: true, results }
}
