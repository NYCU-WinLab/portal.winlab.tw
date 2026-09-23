import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { greetOnPanel } from "@/lib/door/greet"

type FetchImpl = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>

const stubFetch = (impl: FetchImpl) =>
  spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch)

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "DISPLAY_API_URL",
  "DISPLAY_API_SECRET",
] as const
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

const user = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "詠翔 詹",
}
const greeting = { userId: user.id, fallbackName: user.name }

let fetchSpy: ReturnType<typeof stubFetch> | undefined
let errorSpy: ReturnType<typeof spyOn<Console, "error">>
let debugSpy: ReturnType<typeof spyOn<Console, "debug">>

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test"
  process.env.DISPLAY_API_URL = "http://panel.test"
  process.env.DISPLAY_API_SECRET = "panel-secret"
  errorSpy = spyOn(console, "error").mockImplementation(() => {})
  debugSpy = spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
  errorSpy.mockRestore()
  debugSpy.mockRestore()
  for (const key of ENV_KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const isPanel = (input: Parameters<typeof fetch>[0]) =>
  String(input instanceof Request ? input.url : input).startsWith(
    "http://panel.test/"
  )

const panelCalls = () =>
  (fetchSpy?.mock.calls ?? []).filter(([input]) => isPanel(input))

const sentNames = () =>
  panelCalls().map(([, init]) => JSON.parse(String(init?.body)))

const queued = () =>
  Promise.resolve(Response.json({ queued: true, label: "x" }, { status: 202 }))

describe("greetOnPanel", () => {
  test("does nothing at all when the panel env is unset", async () => {
    delete process.env.DISPLAY_API_URL
    fetchSpy = stubFetch(queued)
    await greetOnPanel(greeting)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test("sends user_profiles.name as JSON to /api/greet", async () => {
    fetchSpy = stubFetch((input) =>
      isPanel(input)
        ? queued()
        : Promise.resolve(Response.json({ name: "郭愷" }))
    )
    await greetOnPanel(greeting)

    const profileCall = fetchSpy.mock.calls.find(([input]) => !isPanel(input))
    const profileUrl = new URL(String(profileCall?.[0]))
    expect(profileUrl.pathname).toBe("/rest/v1/user_profiles")
    expect(profileUrl.searchParams.get("select")).toBe("name")
    expect(profileUrl.searchParams.get("id")).toBe(`eq.${user.id}`)

    const [call] = panelCalls()
    expect(String(call?.[0])).toBe("http://panel.test/api/greet")
    const init = call?.[1]
    expect(init?.method).toBe("POST")
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer panel-secret")
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(sentNames()).toEqual([{ name: "郭愷", seconds: 10 }])
  })

  test("an empty profile name falls back to the JWT name as sent", async () => {
    fetchSpy = stubFetch((input) =>
      isPanel(input) ? queued() : Promise.resolve(Response.json({ name: " " }))
    )
    await greetOnPanel(greeting)
    // The panel service applies the family-first swap, so Portal sends it raw.
    expect(sentNames()).toEqual([{ name: "詠翔 詹", seconds: 10 }])
  })

  test("a hung profile read times out and falls back to the JWT name", async () => {
    fetchSpy = stubFetch((input, init) => {
      if (isPanel(input)) return queued()
      // A PostgREST that never answers; like real fetch, it rejects once
      // the signal aborts.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) return reject(signal.reason)
        signal?.addEventListener("abort", () => reject(signal.reason))
      })
    })
    const started = performance.now()
    await greetOnPanel(greeting, { profileTimeoutMs: 50 })
    expect(performance.now() - started).toBeLessThan(2000)
    expect(sentNames()).toEqual([{ name: "詠翔 詹", seconds: 10 }])
    // One profile attempt: the abort is not retried.
    expect(fetchSpy.mock.calls.length - panelCalls().length).toBe(1)
  })

  test("without a user id it skips the profile read and uses the fallback", async () => {
    fetchSpy = stubFetch(queued)
    await greetOnPanel({ userId: null, fallbackName: "Simon Chu" })
    expect(fetchSpy.mock.calls.every(([input]) => isPanel(input))).toBe(true)
    expect(sentNames()).toEqual([{ name: "Simon Chu", seconds: 10 }])
  })

  test("a non-2xx from the panel is logged and does not throw", async () => {
    fetchSpy = stubFetch((input) =>
      isPanel(input)
        ? Promise.resolve(new Response("bad", { status: 500 }))
        : Promise.resolve(Response.json({ name: "郭愷" }))
    )
    await greetOnPanel(greeting)
    expect(errorSpy).toHaveBeenCalledWith("[door] panel responded 500")
  })
})
