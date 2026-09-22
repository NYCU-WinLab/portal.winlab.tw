// Pure card logic for /door/admin: what a card id and a holder name are allowed
// to be, and how the list stored in door_cards lines up with the list the
// controller actually holds. No React, no Supabase, no fetch — this is the part
// that is unit-tested, and the part the client bundle is allowed to import.

import type { ControllerCard, HamsErrorCode } from "@/lib/door/hams"

export type DoorCardSyncState =
  | "synced"
  | "missing_on_controller"
  | "unknown_on_controller"
  | "unknown"

export type DoorCardRow = {
  card_id: string
  holder_name: string
  holder_user_id: string | null
  note: string | null
  sync_state: DoorCardSyncState
  last_seen_at: string | null
}

export type DoorCardView = DoorCardRow & {
  controller_name: string | null
  in_database: boolean
}

export const CARD_ID_LENGTH = 10
export const CARD_ID_PATTERN = /^[0-9]{10}$/

// A ChameleonUltra in reader mode hands back a card's ISO14443A UID, and the
// controller's card number is that same UID read little-endian: reader UID
// 75 B3 8D 5E reverses to 5E 8D B3 75 = 0x5E8DB375 = 1586344821, a real
// enrolled card. Only 4-byte UIDs map to a number here; 7-byte UIDs and the
// like are out of scope. A UID whose first byte is 0x08 is a random one the
// card re-rolls on every tap (phones, privacy cards), so it can never be
// enrolled. A 4-byte value tops out at 4294967295, well under 2^53, so a plain
// JS number is exact.
export type UidCardNumber =
  | { ok: true; cardNumber: string }
  | { ok: false; reason: "unsupported_length" | "random_uid" }

const RANDOM_UID_PREFIX = 0x08

export function uidToCardNumber(
  uid: Uint8Array | readonly number[]
): UidCardNumber {
  if (uid.length !== 4) return { ok: false, reason: "unsupported_length" }
  if (uid[0] === RANDOM_UID_PREFIX) return { ok: false, reason: "random_uid" }

  let value = 0
  for (let i = uid.length - 1; i >= 0; i--) {
    value = value * 256 + (uid[i] ?? 0)
  }
  return { ok: true, cardNumber: String(value).padStart(CARD_ID_LENGTH, "0") }
}

// Big5 is what the controller stores names in: two bytes per Chinese
// character, one per ASCII character, 16 bytes of room. This is the client-side
// approximation so the admin sees the problem while typing; the bridge does the
// real encode and answers 422 when it disagrees.
export const HOLDER_NAME_MAX_BYTES = 16

export function isValidCardId(value: string): boolean {
  return CARD_ID_PATTERN.test(value)
}

export function validateCardId(value: string): string | null {
  if (value.length === 0) return "請輸入卡號。"
  if (!/^[0-9]*$/.test(value)) return "卡號只能是數字。"
  if (value.length !== CARD_ID_LENGTH)
    return `卡號是 ${CARD_ID_LENGTH} 位數字，開頭的 0 要一起輸入。`
  return null
}

export function big5ByteLength(value: string): number {
  let bytes = 0
  for (const char of value) {
    bytes += (char.codePointAt(0) ?? 0) < 128 ? 1 : 2
  }
  return bytes
}

export function validateHolderName(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return "請輸入姓名。"
  if (big5ByteLength(trimmed) > HOLDER_NAME_MAX_BYTES)
    return `姓名最多 ${HOLDER_NAME_MAX_BYTES} 個位元組（中文算 2、英數算 1）。`
  return null
}

// What the holder picker resolves to before it hits the server. A card always
// needs a label for the controller: for a member that label is the member's own
// name (kept in step with the member record instead of retyped), for a guest it
// is the free-text label the admin types.
export type HolderChoice =
  | { kind: "guest"; label: string }
  | { kind: "member"; member: { id: string; name: string | null } }

export type DerivedHolder = {
  holder_name: string
  holder_user_id: string | null
}

export function deriveHolder(choice: HolderChoice): DerivedHolder {
  if (choice.kind === "guest")
    return { holder_name: choice.label.trim(), holder_user_id: null }
  return {
    holder_name: (choice.member.name ?? "").trim(),
    holder_user_id: choice.member.id,
  }
}

export const SYNC_STATE_LABELS: Record<DoorCardSyncState, string> = {
  synced: "已同步",
  missing_on_controller: "卡機沒有",
  unknown_on_controller: "卡機多出來",
  unknown: "未比對",
}

export const HAMS_ERROR_MESSAGES: Record<HamsErrorCode, string> = {
  unauthorized: "卡機橋接服務拒絕了這次請求，請檢查 HAMS_API_SECRET。",
  validation: "卡號或姓名不符合卡機規格。",
  exists: "這張卡已經在卡機裡了。",
  not_found: "卡機上找不到這張卡。",
  controller_unreachable: "連不上卡機，請確認卡機和橋接服務都還活著。",
  controller_busy: "卡機正在忙，等一下再試一次。",
  table_suspect: "卡機卡表疑似損毀，請先用 HAMS 重新上傳",
  verify_failed: "卡機沒有確認這次變更，請按「與卡機比對」",
  rename_lost_card:
    "改名時卡機已刪除舊資料但新增失敗，這張卡目前無法開門，請重新新增",
  unknown: "卡機橋接服務回了沒看過的錯誤。",
}

export function hamsErrorMessage(
  code: HamsErrorCode | undefined,
  fallback: string
): string {
  if (!code) return fallback
  return HAMS_ERROR_MESSAGES[code] ?? fallback
}

// Card numbers identify a physical key. A log line or an error toast is read
// by more people than the card list is, so anything that leaves this feature
// carries only the last four digits.
export function maskCardId(cardId: string): string {
  if (cardId.length <= 4) return cardId
  return `${"*".repeat(cardId.length - 4)}${cardId.slice(-4)}`
}

export type ControllerDiff = {
  synced: string[]
  missingOnController: string[]
  unknownOnController: string[]
}

// Which side of the fence each card id falls on. The controller is the
// authority on what opens the door; door_cards is the authority on what should.
export function diffControllerCards(
  rows: Pick<DoorCardRow, "card_id">[],
  controller: Pick<ControllerCard, "card_id">[]
): ControllerDiff {
  const onController = new Set(controller.map((c) => c.card_id))
  const inDatabase = new Set(rows.map((r) => r.card_id))

  return {
    synced: rows
      .filter((r) => onController.has(r.card_id))
      .map((r) => r.card_id),
    missingOnController: rows
      .filter((r) => !onController.has(r.card_id))
      .map((r) => r.card_id),
    unknownOnController: controller
      .filter((c) => !inDatabase.has(c.card_id))
      .map((c) => c.card_id),
  }
}

// The controller holds a few dozen cards. A count anywhere near this is the
// signature of the corruption that motivated #1192 — the device claimed 10,240
// cards while only 10 were readable.
export const CARD_COUNT_ALARM = 200

export type ReconcilePlan = {
  synced: string[]
  missingOnController: string[]
  unknownOnController: string[]
  controllerCardCount: number
  tableSuspect: boolean
  drifted: boolean
  writeSyncState: boolean
}

// Everything reconcile decides, decided before anything is written. A card
// table this size is not a list, it is damage, and what it reports as present
// or absent means nothing — so `writeSyncState` goes false and the comparison
// is recorded without marking every real card missing on the strength of a
// corrupt read.
export function planReconcile(
  rows: Pick<DoorCardRow, "card_id">[],
  controller: Pick<ControllerCard, "card_id">[],
  controllerCardCount: number
): ReconcilePlan {
  const diff = diffControllerCards(rows, controller)
  const tableSuspect = controllerCardCount > CARD_COUNT_ALARM

  return {
    ...diff,
    controllerCardCount,
    tableSuspect,
    drifted:
      tableSuspect ||
      diff.missingOnController.length > 0 ||
      diff.unknownOnController.length > 0,
    writeSyncState: !tableSuspect,
  }
}

export type ImportPlan<T> = {
  adopt: T[]
  invalid: T[]
  alreadyKnown: number
}

// Which controller cards the import should adopt. A card id the check
// constraint would reject fails the whole insert, so one unreadable entry in a
// damaged table must not stop the other fifteen real cards from coming across.
export function planImport<T extends Pick<ControllerCard, "card_id">>(
  controller: T[],
  knownCardIds: Iterable<string>
): ImportPlan<T> {
  const known = new Set(knownCardIds)
  const invalid = controller.filter((card) => !isValidCardId(card.card_id))
  const valid = controller.filter((card) => isValidCardId(card.card_id))
  const adopt = valid.filter((card) => !known.has(card.card_id))

  return { adopt, invalid, alreadyKnown: valid.length - adopt.length }
}

export function syncStateFor(
  cardId: string,
  controller: Pick<ControllerCard, "card_id">[]
): DoorCardSyncState {
  return controller.some((c) => c.card_id === cardId)
    ? "synced"
    : "missing_on_controller"
}

// The display model. `controller` is null when the bridge could not be reached,
// and then the stored sync_state is all we know — showing everything as
// "卡機沒有" because the network blipped would be a lie.
export function mergeDoorCards(
  rows: DoorCardRow[],
  controller: ControllerCard[] | null
): DoorCardView[] {
  if (!controller) {
    return [...rows]
      .map((row) => ({ ...row, controller_name: null, in_database: true }))
      .sort(byCardId)
  }

  const byId = new Map(controller.map((c) => [c.card_id, c]))
  const known = new Set(rows.map((r) => r.card_id))

  const merged: DoorCardView[] = rows.map((row) => {
    const match = byId.get(row.card_id)
    return {
      ...row,
      sync_state: match ? "synced" : "missing_on_controller",
      controller_name: match?.name ?? null,
      in_database: true,
    }
  })

  for (const card of controller) {
    if (known.has(card.card_id)) continue
    merged.push({
      card_id: card.card_id,
      holder_name: card.name,
      holder_user_id: null,
      note: null,
      sync_state: "unknown_on_controller",
      last_seen_at: null,
      controller_name: card.name,
      in_database: false,
    })
  }

  return merged.sort(byCardId)
}

function byCardId(a: { card_id: string }, b: { card_id: string }) {
  return a.card_id.localeCompare(b.card_id)
}
