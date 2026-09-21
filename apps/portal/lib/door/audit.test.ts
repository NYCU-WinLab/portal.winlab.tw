import { describe, expect, test } from "bun:test"

import { buildDoorEvent, doorEventAttributes } from "@/lib/door/audit"

const user = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "someone@winlab.tw",
  name: "Someone",
  avatarUrl: null,
}

describe("buildDoorEvent", () => {
  test("snapshots the user and keeps error null on success", () => {
    const row = buildDoorEvent(
      user,
      { ok: true, latencyMs: 412.6 },
      { "client.address": "140.113.1.2", "geo.city": "Hsinchu" }
    )
    expect(row).toEqual({
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      ok: true,
      error: null,
      latency_ms: 413,
      client_address: "140.113.1.2",
      geo_city: "Hsinchu",
    })
  })

  test("carries the error on failure and tolerates missing attribution", () => {
    const row = buildDoorEvent(
      user,
      { ok: false, latencyMs: 8000, error: "Door API responded 504" },
      {}
    )
    expect(row.ok).toBe(false)
    expect(row.error).toBe("Door API responded 504")
    expect(row.client_address).toBeNull()
    expect(row.geo_city).toBeNull()
  })
})

describe("doorEventAttributes", () => {
  test("omits absent optional fields instead of writing null", () => {
    const attrs = doorEventAttributes(
      buildDoorEvent({ ...user, email: null }, { ok: true, latencyMs: 100 }, {})
    )
    expect(attrs).toEqual({
      "door.action": "open",
      "door.ok": true,
      "user.id": user.id,
      "user.name": user.name,
      "door.latency_ms": 100,
    })
  })
})
