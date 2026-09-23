import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"

import { parseDoorState, showOnDoor } from "@/lib/door/client"

describe("parseDoorState", () => {
  test("accepts the device payload", () => {
    expect(parseDoorState({ open: true })).toEqual({ open: true })
    expect(parseDoorState({ open: false })).toEqual({ open: false })
  })

  test("rejects anything without a boolean open flag", () => {
    expect(() => parseDoorState({ open: "true" })).toThrow()
    expect(() => parseDoorState({})).toThrow()
    expect(() => parseDoorState(null)).toThrow()
    expect(() => parseDoorState("open")).toThrow()
  })
})

const bitmap = new Uint8Array(128)
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>
let errorSpy: ReturnType<typeof spyOn<Console, "error">>
let warnSpy: ReturnType<typeof spyOn<Console, "warn">>
const saved = {
  url: process.env.DOOR_API_URL,
  secret: process.env.DOOR_API_SECRET,
}

type FetchImpl = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>

// Bun's fetch type carries a `preconnect` method a stub has no use for.
const stubFetch = (impl: FetchImpl) =>
  spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch)

beforeEach(() => {
  process.env.DOOR_API_URL = "http://door.test/"
  process.env.DOOR_API_SECRET = "test-secret"
  errorSpy = spyOn(console, "error").mockImplementation(() => {})
  warnSpy = spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  fetchSpy?.mockRestore()
  errorSpy.mockRestore()
  warnSpy.mockRestore()
  process.env.DOOR_API_URL = saved.url
  process.env.DOOR_API_SECRET = saved.secret
})

describe("showOnDoor", () => {
  test("posts the bitmap to /api/show with the bearer token", async () => {
    fetchSpy = stubFetch(async () => new Response(null, { status: 202 }))
    expect(await showOnDoor(bitmap, { seconds: 10, color: "FFFFFF" })).toBe(
      "shown"
    )
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toBe("http://door.test/api/show?s=10&c=ffffff")
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-secret"
    )
    expect((init?.body as Uint8Array).length).toBe(128)
  })

  test("clamps the duration to 1-60 seconds", async () => {
    fetchSpy = stubFetch(async () => new Response(null, { status: 202 }))
    await showOnDoor(bitmap, { seconds: 600 })
    await showOnDoor(bitmap, { seconds: 0 })
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("s=60&")
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("s=1&")
  })

  test("reads a 404 as old firmware and does not throw", async () => {
    fetchSpy = stubFetch(async () => new Response("not found", { status: 404 }))
    expect(await showOnDoor(bitmap)).toBe("unsupported")
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
    expect(await showOnDoor(bitmap, { timeoutMs: 20 })).toBe("failed")
    expect(errorSpy).toHaveBeenCalled()
  })

  test("a network error or 5xx is swallowed", async () => {
    fetchSpy = stubFetch(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await showOnDoor(bitmap)).toBe("failed")
    fetchSpy.mockRestore()
    fetchSpy = stubFetch(async () => new Response(null, { status: 500 }))
    expect(await showOnDoor(bitmap)).toBe("failed")
  })

  test("a wrong-sized bitmap or bad colour never reaches the board", async () => {
    fetchSpy = stubFetch(async () => new Response(null, { status: 202 }))
    expect(await showOnDoor(new Uint8Array(64))).toBe("failed")
    expect(await showOnDoor(bitmap, { color: "red" })).toBe("failed")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
