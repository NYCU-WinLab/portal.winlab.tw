import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test"

// "server-only" throws outside Next's bundler; the module under test needs it.
mock.module("server-only", () => ({}))
const { fetchCohorts } = await import("@/lib/groups/cohorts")

const keys = [
  "KEYCLOAK_URL",
  "KEYCLOAK_REALM",
  "KEYCLOAK_READ_CLIENT_ID",
  "KEYCLOAK_READ_CLIENT_SECRET",
] as const
const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
const realFetch = globalThis.fetch

beforeEach(() => {
  process.env.KEYCLOAK_URL = "https://kc.test"
  process.env.KEYCLOAK_REALM = "r"
  process.env.KEYCLOAK_READ_CLIENT_ID = "c"
  process.env.KEYCLOAK_READ_CLIENT_SECRET = "s"
})
afterEach(() => {
  globalThis.fetch = realFetch
  for (const k of keys) {
    if (original[k] === undefined) delete process.env[k]
    else process.env[k] = original[k]
  }
})

/** A fetch that only ends when its signal aborts (or never, with no signal). */
const hang = ((_: RequestInfo | URL, init?: RequestInit) =>
  new Promise((_res, rej) =>
    init?.signal?.addEventListener("abort", () =>
      rej(new DOMException("aborted", "AbortError"))
    )
  )) as unknown as typeof fetch

describe("fetchCohorts deadline", () => {
  test("a token request that never answers returns unavailable in time", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {})
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch
    const t0 = Date.now()
    expect(await fetchCohorts(30)).toBeNull()
    expect(Date.now() - t0).toBeLessThan(1000)
    err.mockRestore()
  })

  test("a group read that hangs is aborted and returns unavailable", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {})
    let aborted = false
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/token"))
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "t", expires_in: 60 }))
        )
      init?.signal?.addEventListener("abort", () => (aborted = true))
      return hang(input, init)
    }) as unknown as typeof fetch
    expect(await fetchCohorts(30)).toBeNull()
    expect(aborted).toBe(true)
    err.mockRestore()
  })

  test("without Keycloak env it is unavailable without a request", async () => {
    delete process.env.KEYCLOAK_URL
    let called = false
    globalThis.fetch = (() => {
      called = true
      return Promise.reject(new Error("no"))
    }) as unknown as typeof fetch
    expect(await fetchCohorts(30)).toBeNull()
    expect(called).toBe(false)
  })
})
