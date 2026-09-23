import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { renderNameBitmap } from "@/lib/door/display"
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

describe("greetOnPanel", () => {
  test("does nothing at all when the panel env is unset", async () => {
    delete process.env.DISPLAY_API_URL
    fetchSpy = stubFetch(async () => new Response(null, { status: 202 }))
    await greetOnPanel(greeting)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test("reads user_profiles.name and posts its bitmap to the panel", async () => {
    fetchSpy = stubFetch(async (input) => {
      if (isPanel(input)) return new Response(null, { status: 202 })
      return Response.json({ name: "郭愷" })
    })
    await greetOnPanel(greeting)

    const profileCall = fetchSpy.mock.calls.find(([input]) => !isPanel(input))
    const profileUrl = new URL(
      String(
        profileCall?.[0] instanceof Request
          ? profileCall[0].url
          : profileCall?.[0]
      )
    )
    expect(profileUrl.pathname).toBe("/rest/v1/user_profiles")
    expect(profileUrl.searchParams.get("select")).toBe("name")
    expect(profileUrl.searchParams.get("id")).toBe(`eq.${user.id}`)

    const [call] = panelCalls()
    expect(String(call?.[0])).toBe("http://panel.test/api/show?s=10&c=ffffff")
    const init = call?.[1]
    expect(init?.method).toBe("POST")
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer panel-secret")
    expect(headers.get("Content-Type")).toBe("application/octet-stream")
    const body = init?.body as Uint8Array
    expect(body.length).toBe(128)
    expect(Array.from(body)).toEqual(Array.from(renderNameBitmap("郭愷")))
  })

  test("a hung profile read times out and falls back to the JWT name", async () => {
    fetchSpy = stubFetch((input, init) => {
      if (isPanel(input)) {
        return Promise.resolve(new Response(null, { status: 202 }))
      }
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

    const [call] = panelCalls()
    const body = call?.[1]?.body as Uint8Array
    // The JWT name "詠翔 詹" is shown family first.
    expect(Array.from(body)).toEqual(Array.from(renderNameBitmap("詹詠翔")))
    // One profile attempt: the abort is not retried.
    expect(fetchSpy.mock.calls.length - panelCalls().length).toBe(1)
  })

  test("without a user id it skips the profile read and uses the fallback", async () => {
    fetchSpy = stubFetch(async () => new Response(null, { status: 202 }))
    await greetOnPanel({ userId: null, fallbackName: "Simon Chu" })
    expect(fetchSpy.mock.calls.every(([input]) => isPanel(input))).toBe(true)
    const body = panelCalls()[0]?.[1]?.body as Uint8Array
    expect(Array.from(body)).toEqual(Array.from(renderNameBitmap("Simon")))
  })
})
