import "server-only"

// Server-only client for hams-bridge, the small HTTP service on lab infra that
// wraps the Hundure RAC-960PME access controller. The controller speaks a
// binary TCP protocol and only answers on the lab network, so Vercel talks to
// the bridge instead:
//   GET    /cards        -> { count, cards: [...] }
//   POST   /cards        -> 201 { card, count_before, count_after }
//   PUT    /cards/{id}   -> 200 { card, count_before, count_after }
//   DELETE /cards/{id}   -> 200 { count_before, count_after }
//   GET    /health       -> device version, clock skew, card count
// Every write re-reads the card table on the device before answering, which is
// why a failure here is worth surfacing verbatim: the bridge already knows
// whether the change landed. The one case where it landed halfway is a rename,
// which the device only does as delete-then-add: the bridge reports that as
// 502 rename_lost_card and the card is gone. Both env vars are server-only.

export type HamsErrorCode =
  | "unauthorized"
  | "validation"
  | "exists"
  | "not_found"
  | "controller_unreachable"
  | "controller_busy"
  | "table_suspect"
  | "verify_failed"
  | "rename_lost_card"
  | "unknown"

export class HamsError extends Error {
  readonly code: HamsErrorCode
  readonly status: number
  // The raw failure body. rename_lost_card carries `deleted` and `observed`
  // counts that say how far the half-applied rename got, and the audit row is
  // the only place that ever gets to see them.
  readonly body: Record<string, unknown> | null

  constructor(
    message: string,
    code: HamsErrorCode,
    status: number,
    body: Record<string, unknown> | null = null
  ) {
    super(message)
    this.name = "HamsError"
    this.code = code
    this.status = status
    this.body = body
  }
}

export type ControllerHealth = {
  ok: boolean
  device_version: string
  firmware_date: string
  device_time: string
  host_time: string
  clock_skew_s: number
  card_count: number
  event_count: number
}

export type ControllerCard = {
  card_id: string
  name: string
  time_index: number
  status: string
}

export type ControllerCardList = { count: number; cards: ControllerCard[] }

export type ControllerWriteResult = {
  card: ControllerCard
  count_before: number
  count_after: number
}

export type ControllerDeleteResult = {
  count_before: number
  count_after: number
}

const TIMEOUT_MS = 15000

const KNOWN_CODES: readonly HamsErrorCode[] = [
  "unauthorized",
  "validation",
  "exists",
  "not_found",
  "controller_unreachable",
  "controller_busy",
  "table_suspect",
  "verify_failed",
  "rename_lost_card",
]

export function hamsConfigured(): boolean {
  return Boolean(process.env.HAMS_API_URL && process.env.HAMS_API_SECRET)
}

// The bridge answers every failure as { error, code }. Keep the code: the UI
// maps table_suspect and verify_failed to instructions the admin can act on,
// and "Bad Request" alone would not tell them apart.
function toError(status: number, body: unknown): HamsError {
  const shape = (body ?? {}) as { error?: unknown; code?: unknown }
  const code =
    typeof shape.code === "string" &&
    (KNOWN_CODES as readonly string[]).includes(shape.code)
      ? (shape.code as HamsErrorCode)
      : "unknown"
  const message =
    typeof shape.error === "string" && shape.error.length > 0
      ? shape.error
      : `hams-bridge responded ${status} (${code})`
  return new HamsError(
    message,
    code,
    status,
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null
  )
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const base = process.env.HAMS_API_URL
  const secret = process.env.HAMS_API_SECRET
  if (!base || !secret) throw new Error("HAMS bridge is not configured")

  let res: Response
  try {
    res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // A dead bridge and a dead controller look the same from here, and both
    // mean "the card list was not touched", so they share one code.
    throw new HamsError(
      err instanceof Error ? err.message : "hams-bridge request failed",
      "controller_unreachable",
      0
    )
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) throw toError(res.status, payload)
  return payload as T
}

export function fetchControllerHealth(): Promise<ControllerHealth> {
  return request<ControllerHealth>("/health", "GET")
}

export async function fetchControllerCardList(): Promise<ControllerCardList> {
  const list = await request<ControllerCardList>("/cards", "GET")
  return { count: list.count ?? 0, cards: list.cards ?? [] }
}

export async function fetchControllerCards(): Promise<ControllerCard[]> {
  const { cards } = await fetchControllerCardList()
  return cards
}

export function createControllerCard(
  cardId: string,
  name: string
): Promise<ControllerWriteResult> {
  return request<ControllerWriteResult>("/cards", "POST", {
    card_id: cardId,
    name,
  })
}

export function renameControllerCard(
  cardId: string,
  name: string
): Promise<ControllerWriteResult> {
  return request<ControllerWriteResult>(
    `/cards/${encodeURIComponent(cardId)}`,
    "PUT",
    { name }
  )
}

export function deleteControllerCard(
  cardId: string
): Promise<ControllerDeleteResult> {
  return request<ControllerDeleteResult>(
    `/cards/${encodeURIComponent(cardId)}`,
    "DELETE"
  )
}
