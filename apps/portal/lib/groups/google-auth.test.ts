import { afterEach, describe, expect, mock, test } from "bun:test"

// "server-only" throws outside Next's bundler; the module under test needs it.
mock.module("server-only", () => ({}))

const { groupsApiFromEnv } = await import("@/lib/groups/google-auth")
import { BATCH_BUDGET_MS } from "@/lib/groups/membership"

const KEYS = [
  "GOOGLE_GROUPS_WIF_AUDIENCE",
  "GOOGLE_GROUPS_SA_EMAIL",
  "GOOGLE_GROUPS_DOMAIN",
] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("groupsApiFromEnv", () => {
  test("every read made with it carries the action deadline", () => {
    process.env.GOOGLE_GROUPS_WIF_AUDIENCE = "//iam.googleapis.com/x"
    process.env.GOOGLE_GROUPS_SA_EMAIL = "sa@p.iam.gserviceaccount.com"
    process.env.GOOGLE_GROUPS_DOMAIN = "winlab.tw"
    const before = Date.now()
    const api = groupsApiFromEnv()
    expect(api?.deadline).toBeGreaterThanOrEqual(before + BATCH_BUDGET_MS)
    expect(api?.deadline).toBeLessThanOrEqual(Date.now() + BATCH_BUDGET_MS)
  })
})
