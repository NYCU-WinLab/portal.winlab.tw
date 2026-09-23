import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createClient } from "@supabase/supabase-js"

import { SUFFIX_TOO_WIDE } from "@/lib/door/greeting-suffix"
import {
  SAVE_SUFFIX_FAILED,
  updateDoorGreetingSuffix,
} from "@/lib/profile/door-greeting"

const USER_ID = "51111111-1111-1111-1111-111111111111"

type Call = { url: string; method: string; body: unknown }
let calls: Call[]
let respondWith: () => Response
const restorers: (() => void)[] = []

beforeEach(() => {
  calls = []
  respondWith = () => Response.json([{ id: USER_ID }], { status: 200 })
  const fetchSpy = spyOn(globalThis, "fetch")
  const errorSpy = spyOn(console, "error").mockImplementation(() => {})
  restorers.push(
    () => fetchSpy.mockRestore(),
    () => errorSpy.mockRestore()
  )
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    })
    return respondWith()
  }
  fetchSpy.mockImplementation(Object.assign(respond, { preconnect: () => {} }))
})

afterEach(() => {
  for (const restore of restorers) restore()
  restorers.length = 0
})

const client = () =>
  createClient("https://database.example", "member-jwt", {
    auth: { persistSession: false, autoRefreshToken: false },
  })

describe("updateDoorGreetingSuffix", () => {
  test("writes the normalised suffix to the member's own row", async () => {
    const result = await updateDoorGreetingSuffix(client(), USER_ID, " 好帥 ")
    expect(result).toEqual({ ok: true, suffix: "好帥" })
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.method).toBe("PATCH")
    expect(call?.url).toContain("/rest/v1/user_profiles")
    expect(call?.url).toContain(`id=eq.${USER_ID}`)
    expect(call?.body).toEqual({ door_greeting_suffix: "好帥" })
  })

  test("clearing the field writes null", async () => {
    const result = await updateDoorGreetingSuffix(client(), USER_ID, "  ")
    expect(result).toEqual({ ok: true, suffix: null })
    expect(calls[0]?.body).toEqual({ door_greeting_suffix: null })
  })

  test("an invalid value never reaches the database", async () => {
    const result = await updateDoorGreetingSuffix(client(), USER_ID, "一二三四")
    expect(result).toEqual({ ok: false, error: SUFFIX_TOO_WIDE })
    expect(calls).toHaveLength(0)
  })

  test("a database error is a generic failure, not the Postgres message", async () => {
    respondWith = () =>
      Response.json(
        { code: "23514", message: "violates check constraint" },
        { status: 400 }
      )
    const result = await updateDoorGreetingSuffix(client(), USER_ID, "好")
    expect(result).toEqual({ ok: false, error: SAVE_SUFFIX_FAILED })
  })

  test("a row RLS filtered out counts as a failure", async () => {
    respondWith = () => Response.json([], { status: 200 })
    const result = await updateDoorGreetingSuffix(client(), USER_ID, "好")
    expect(result).toEqual({ ok: false, error: SAVE_SUFFIX_FAILED })
  })
})
