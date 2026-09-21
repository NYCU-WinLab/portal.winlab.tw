import { describe, expect, test } from "bun:test"

import type { DoorEvent } from "@/lib/door/audit"
import { doorEventRows } from "@/lib/mcp/tools/door"

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
})
