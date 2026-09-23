import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { showOnPanel } from "@/lib/door/panel"

type FetchImpl = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>

// Bun's fetch type carries a `preconnect` method a stub has no use for.
const stubFetch = (impl: FetchImpl) =>
  spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch)

const bitmap = new Uint8Array(128)
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

const accepted = async () => new Response(null, { status: 202 })

describe("showOnPanel", () => {
  test("posts the bitmap to /api/show with the panel token", async () => {
    fetchSpy = stubFetch(accepted)
    expect(await showOnPanel(bitmap, { seconds: 10, color: "FFFFFF" })).toBe(
      "shown"
    )
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toBe("http://panel.test/api/show?s=10&c=ffffff")
    expect(init?.method).toBe("POST")
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer panel-secret")
    expect(headers.get("Content-Type")).toBe("application/octet-stream")
    expect((init?.body as Uint8Array).length).toBe(128)
  })

  test("skips without a request or an error when either env var is unset", async () => {
    fetchSpy = stubFetch(accepted)
    delete process.env.DISPLAY_API_SECRET
    expect(await showOnPanel(bitmap)).toBe("skipped")
    process.env.DISPLAY_API_SECRET = "panel-secret"
    delete process.env.DISPLAY_API_URL
    expect(await showOnPanel(bitmap)).toBe("skipped")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(debugSpy.mock.calls.length).toBeLessThanOrEqual(1)
  })

  test("clamps the duration to 1-60 seconds", async () => {
    fetchSpy = stubFetch(accepted)
    await showOnPanel(bitmap, { seconds: 600 })
    await showOnPanel(bitmap, { seconds: 0 })
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("s=60&")
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("s=1&")
  })

  test("any non-2xx is logged, not thrown", async () => {
    for (const status of [401, 404, 500]) {
      fetchSpy?.mockRestore()
      fetchSpy = stubFetch(async () => new Response(null, { status }))
      expect(await showOnPanel(bitmap)).toBe("failed")
    }
    expect(errorSpy).toHaveBeenCalledTimes(3)
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
    expect(await showOnPanel(bitmap, { timeoutMs: 20 })).toBe("failed")
    expect(errorSpy).toHaveBeenCalled()
  })

  test("a network error is swallowed", async () => {
    fetchSpy = stubFetch(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await showOnPanel(bitmap)).toBe("failed")
  })

  test("a wrong-sized bitmap or bad colour never reaches the panel", async () => {
    fetchSpy = stubFetch(accepted)
    expect(await showOnPanel(new Uint8Array(64))).toBe("failed")
    expect(await showOnPanel(bitmap, { color: "red" })).toBe("failed")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
