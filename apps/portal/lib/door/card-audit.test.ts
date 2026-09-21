import { describe, expect, test } from "bun:test"

import {
  buildDoorCardChange,
  CRON_ACTOR_NAME,
  doorCardChangeAttributes,
} from "@/lib/door/card-audit"
import type { NormalizedUser } from "@/lib/user"

const user: NormalizedUser = {
  id: "99999999-8888-7777-6666-555555555555",
  email: "loki@winlab.tw",
  name: "Loki",
  avatarUrl: null,
}

describe("buildDoorCardChange", () => {
  test("snapshots the actor and the attribution", () => {
    const change = buildDoorCardChange(
      user,
      "add",
      "0001234567",
      { ok: true, latencyMs: 412.6 },
      { "client.address": "140.113.1.2", "geo.city": "Hsinchu" }
    )
    expect(change.user_id).toBe(user.id)
    expect(change.user_name).toBe("Loki")
    expect(change.latency_ms).toBe(413)
    expect(change.client_address).toBe("140.113.1.2")
    expect(change.error).toBeNull()
  })

  test("names the cron when nobody is behind the change", () => {
    const change = buildDoorCardChange(
      null,
      "reconcile",
      null,
      { ok: true },
      {}
    )
    expect(change.user_id).toBeNull()
    expect(change.user_name).toBe(CRON_ACTOR_NAME)
    expect(change.latency_ms).toBeNull()
  })

  test("always keeps a reason on a failed change", () => {
    const change = buildDoorCardChange(user, "delete", "1", { ok: false }, {})
    expect(change.ok).toBe(false)
    expect(change.error).toBe("card change failed")
  })
})

describe("doorCardChangeAttributes", () => {
  test("flattens numeric detail onto door.card.* and keeps secrets out", () => {
    const attrs = doorCardChangeAttributes(
      buildDoorCardChange(
        user,
        "reconcile",
        null,
        { ok: true, detail: { synced: 16, drifted: false, note: "ignored" } },
        {}
      )
    )
    expect(attrs["door.card.action"]).toBe("reconcile")
    expect(attrs["door.card.synced"]).toBe(16)
    expect(attrs["door.card.drifted"]).toBe(false)
    expect(attrs["door.card.note"]).toBeUndefined()
    expect(attrs["user.email"]).toBe("loki@winlab.tw")
  })
})
