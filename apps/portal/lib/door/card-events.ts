import { createHash, timingSafeEqual } from "node:crypto"

import type { Database } from "@/lib/supabase/database.types"

export const MAX_CARD_EVENT_BODY_BYTES = 65536

export type CardSwipe = {
  event_id: string
  card_id: string
  device_time: string
  event_code: string
  reader: number
  received_at: string
}

export type CardHolderSnapshot = Pick<
  Database["public"]["Tables"]["door_cards"]["Row"],
  "card_id" | "holder_name" | "holder_user_id" | "updated_at"
>

export class CardEventInputError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validTimestamp(value: unknown, device: boolean): value is string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    value.trim() !== value
  ) {
    return false
  }
  const pattern = device
    ? /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/
    : /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/
  if (!pattern.test(value)) return false
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  const wallTime = new Date(timestamp + (device ? 8 * 3600_000 : 0))
  return (
    wallTime.toISOString().slice(0, 19) === value.slice(0, 19) &&
    (!device || wallTime.getUTCFullYear() <= 2063)
  )
}

export function cardIngestAuthorized(
  authorization: string | null,
  secret: string
): boolean {
  if (secret.length < 32 || !authorization || authorization.length > 1024) {
    return false
  }
  const match = /^Bearer ([!-~]+)$/i.exec(authorization)
  if (!match?.[1]) return false
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(secret))
}

export function parseCardSwipes(body: unknown): CardSwipe[] {
  if (
    !isObject(body) ||
    !Array.isArray(body.events) ||
    body.events.length < 1 ||
    body.events.length > 100
  ) {
    throw new CardEventInputError("Expected between 1 and 100 card events")
  }
  const seen = new Set<string>()
  return body.events.map((event: unknown) => {
    if (
      !isObject(event) ||
      typeof event.event_id !== "string" ||
      event.event_id.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(event.event_id) ||
      typeof event.card_id !== "string" ||
      event.card_id.length !== 10 ||
      !/^[0-9]{10}$/.test(event.card_id) ||
      typeof event.event_code !== "string" ||
      event.event_code.length !== 4 ||
      !/^[0-9A-F]{4}$/.test(event.event_code) ||
      (event.reader !== 1 && event.reader !== 2) ||
      !validTimestamp(event.device_time, true) ||
      !validTimestamp(event.received_at, false)
    ) {
      throw new CardEventInputError("Invalid card event")
    }
    if (seen.has(event.event_id)) {
      throw new CardEventInputError("Duplicate event identifier in one batch")
    }
    seen.add(event.event_id)
    return {
      event_id: event.event_id,
      card_id: event.card_id,
      device_time: event.device_time,
      event_code: event.event_code,
      reader: event.reader,
      received_at: event.received_at,
    }
  })
}

export async function readCardSwipes(request: Request): Promise<CardSwipe[]> {
  if (!request.body) throw new CardEventInputError("Missing event body")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_CARD_EVENT_BODY_BYTES) {
        await reader.cancel()
        throw new CardEventInputError("Event body exceeds 64 KiB")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new CardEventInputError("Invalid event JSON")
  }
  return parseCardSwipes(body)
}

const GRANTED_CODES = new Set(["0000", "0009", "003D", "003F"])
const DENIED_CODES: Record<string, string> = {
  "0006": "黑名單",
  "0008": "指紋比對失敗",
  "0014": "無此卡號",
  "0015": "權限不符",
  "0020": "無開門權限",
  "0022": "保全中",
  "003E": "密碼錯誤",
  "0043": "防反潛回限制",
}

export function buildCardDoorEvent(
  event: CardSwipe,
  holder?: CardHolderSnapshot
): Database["public"]["Tables"]["door_events"]["Insert"] {
  // A current assignment is not proof of who held a card in older history.
  const attributed =
    holder?.card_id === event.card_id &&
    Date.parse(event.device_time) >= Date.parse(holder.updated_at)
      ? holder
      : undefined
  const granted = GRANTED_CODES.has(event.event_code)
  const denial = DENIED_CODES[event.event_code]
  return {
    source: "card",
    source_event_id: event.event_id,
    card_id: event.card_id,
    device_event_code: event.event_code,
    device_reader: event.reader,
    created_at: event.device_time,
    received_at: event.received_at,
    user_id: attributed?.holder_user_id ?? null,
    user_email: null,
    user_name: attributed?.holder_name || "卡片",
    ok: granted ? true : denial ? false : null,
    error: denial ?? null,
    latency_ms: null,
    client_address: null,
    geo_city: null,
  }
}
