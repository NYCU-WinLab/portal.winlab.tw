import { describe, expect, test } from "bun:test"

import type { DoorEvent } from "@/lib/door/audit"
import type { DoorCardRow } from "@/lib/door/cards"
import { doorCardRows, doorEventRows } from "@/lib/mcp/tools/door"

const event: DoorEvent = {
  id: "11111111-2222-3333-4444-555555555555",
  created_at: "2026-09-21T02:00:00.000Z",
  user_id: "99999999-8888-7777-6666-555555555555",
  user_email: "someone@winlab.tw",
  user_name: "Someone",
  ok: true,
  error: null,
  latency_ms: 413,
  client_address: "140.113.1.2",
  geo_city: "Hsinchu",
  source: "web",
  source_event_id: null,
  card_id: null,
  device_event_code: null,
  device_reader: null,
  received_at: null,
}

describe("doorEventRows", () => {
  test("keeps the audit fields and drops the client address", () => {
    expect(doorEventRows([event])).toEqual([
      {
        created_at: "2026-09-21T02:00:00.000Z",
        user_name: "Someone",
        user_email: "someone@winlab.tw",
        ok: true,
        error: null,
        latency_ms: 413,
        geo_city: "Hsinchu",
        source: "web",
        card_last_four: null,
        device_event_code: null,
      },
    ])
  })

  test("carries the failure reason through", () => {
    const failed: DoorEvent = {
      ...event,
      ok: false,
      error: "Door API request failed",
      latency_ms: null,
      geo_city: null,
    }
    const [row] = doorEventRows([failed])
    expect(row?.ok).toBe(false)
    expect(row?.error).toBe("Door API request failed")
    expect(row?.latency_ms).toBeNull()
  })

  test("maps an empty log to an empty list", () => {
    expect(doorEventRows([])).toEqual([])
  })

  test("distinguishes a card event without exposing the full card number", () => {
    const [row] = doorEventRows([
      {
        ...event,
        source: "card",
        card_id: "0000000042",
        device_event_code: "00FE",
        user_id: null,
        ok: null,
      },
    ])
    expect(row?.source).toBe("card")
    expect(row?.card_last_four).toBe("0042")
    expect(row?.ok).toBeNull()
    expect(row).not.toHaveProperty("card_id")
  })
})

const cardRow: DoorCardRow = {
  card_id: "0001234567",
  holder_name: "詹詠翔",
  holder_user_id: "99999999-8888-7777-6666-555555555555",
  note: "研究生",
  sync_state: "synced",
  last_seen_at: "2026-09-21T02:00:00.000Z",
}

describe("doorCardRows", () => {
  test("carries the card through and adds the label the page shows", () => {
    expect(doorCardRows([cardRow])).toEqual([
      {
        card_id: "0001234567",
        holder_name: "詹詠翔",
        holder_user_id: "99999999-8888-7777-6666-555555555555",
        note: "研究生",
        sync_state: "synced",
        sync_state_label: "已同步",
        last_seen_at: "2026-09-21T02:00:00.000Z",
      },
    ])
  })

  test("labels a card the controller does not have", () => {
    const [row] = doorCardRows([
      { ...cardRow, sync_state: "missing_on_controller", last_seen_at: null },
    ])
    expect(row?.sync_state_label).toBe("卡機沒有")
    expect(row?.last_seen_at).toBeNull()
  })

  test("keeps a guest card with no portal account", () => {
    const [row] = doorCardRows([
      { ...cardRow, holder_user_id: null, note: null },
    ])
    expect(row?.holder_user_id).toBeNull()
    expect(row?.note).toBeNull()
  })

  test("maps an empty list to an empty list", () => {
    expect(doorCardRows([])).toEqual([])
  })
})
