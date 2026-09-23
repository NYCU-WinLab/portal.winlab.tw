import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { greetNameOnPanel } from "@/lib/door/panel"

type FetchImpl = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>

// Bun's fetch type carries a `preconnect` method a stub has no use for.
const stubFetch = (impl: FetchImpl) =>
  spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch)

const saved = {
  url: process.env.DISPLAY_API_URL,
  secret: process.env.DISPLAY_API_SECRET,
}
let fetchSpy: ReturnType<typeof stubFetch> | undefined
let errorSpy: ReturnType<typeof spyOn<Console, "error">>
let debugSpy: ReturnType<typeof spyOn<Console, "debug">>

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  process.env.DISPLAY_API_URL = "http://panel.test/"
  process.env.DISPLAY_API_SECRET = "panel-secret"
  errorSpy = spyOn(console, "error").mockImplementation(() => {})
  debugSpy = spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
  errorSpy.mockRestore()
  debugSpy.mockRestore()
  restoreEnv("DISPLAY_API_URL", saved.url)
  restoreEnv("DISPLAY_API_SECRET", saved.secret)
})

const queued = async () =>
  Response.json({ queued: true, label: "詹詠翔" }, { status: 202 })

describe("greetNameOnPanel", () => {
  test("posts the raw name as JSON to /api/greet with the panel token", async () => {
    fetchSpy = stubFetch(queued)
    expect(await greetNameOnPanel("  詠翔 詹 ")).toBe("shown")
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toBe("http://panel.test/api/greet")
    expect(init?.method).toBe("POST")
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer panel-secret")
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "詠翔 詹",
      seconds: 10,
    })
  })

  test("skips without a request or an error when either env var is unset", async () => {
    fetchSpy = stubFetch(queued)
    delete process.env.DISPLAY_API_SECRET
    expect(await greetNameOnPanel("Simon")).toBe("skipped")
    process.env.DISPLAY_API_SECRET = "panel-secret"
    delete process.env.DISPLAY_API_URL
    expect(await greetNameOnPanel("Simon")).toBe("skipped")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(debugSpy.mock.calls.length).toBeLessThanOrEqual(1)
  })

  test("a blank name sends nothing", async () => {
    fetchSpy = stubFetch(queued)
    expect(await greetNameOnPanel("   ")).toBe("skipped")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test("clamps the duration and caps an absurd name", async () => {
    fetchSpy = stubFetch(queued)
    await greetNameOnPanel("x".repeat(500), { seconds: 600 })
    await greetNameOnPanel("Simon", { seconds: 0 })
    const bodies = fetchSpy.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body))
    )
    expect(bodies[0]?.seconds).toBe(60)
    expect(bodies[0]?.name).toHaveLength(64)
    expect(bodies[1]?.seconds).toBe(1)
  })

  test("any non-2xx is logged, not thrown", async () => {
    for (const status of [400, 401, 404, 500]) {
      fetchSpy?.mockRestore()
      fetchSpy = stubFetch(async () => new Response(null, { status }))
      expect(await greetNameOnPanel("Simon")).toBe("failed")
    }
    expect(errorSpy).toHaveBeenCalledTimes(4)
  })

  test("a timeout is swallowed", async () => {
    fetchSpy = stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          )
        })
    )
    expect(await greetNameOnPanel("Simon", { timeoutMs: 20 })).toBe("failed")
    expect(errorSpy).toHaveBeenCalled()
  })

  test("a network error is swallowed", async () => {
    fetchSpy = stubFetch(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await greetNameOnPanel("Simon")).toBe("failed")
  })
})
