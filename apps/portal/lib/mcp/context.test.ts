import { describe, expect, test } from "bun:test"

import { callerAsUser, decodeBase64, errorMessage } from "@/lib/mcp/context"

describe("errorMessage", () => {
  test("reads an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })

  test("reads a Supabase error object instead of [object Object]", () => {
    expect(
      errorMessage({
        message: "order is closed",
        details: null,
        hint: "open a new order",
        code: "P0001",
      })
    ).toBe("order is closed; open a new order")
  })

  test("falls back to JSON for an object without a message", () => {
    expect(errorMessage({ code: "42" })).toBe('{"code":"42"}')
  })

  test("stringifies anything else", () => {
    expect(errorMessage("nope")).toBe("nope")
  })
})

describe("decodeBase64", () => {
  const text = Buffer.from("hello door").toString("base64")

  test("strips a data: URL prefix and whitespace", () => {
    const bytes = decodeBase64(
      `data:audio/mpeg;base64,${text.slice(0, 4)}\n${text.slice(4)}`,
      1024
    )
    expect(new TextDecoder().decode(bytes)).toBe("hello door")
  })

  test("rejects garbage and empty input", () => {
    expect(() => decodeBase64("", 1024)).toThrow()
    expect(() => decodeBase64("not base64!!", 1024)).toThrow()
  })

  test("holds the payload to the caller's limit", () => {
    const at = Buffer.alloc(16).toString("base64")
    const over = Buffer.alloc(17).toString("base64")
    expect(decodeBase64(at, 16).byteLength).toBe(16)
    expect(() => decodeBase64(over, 16)).toThrow(/limit is 16/)
  })
})

describe("callerAsUser", () => {
  const caller = {
    token: "t",
    userId: "u1",
    email: "loki@winlab.tw",
    name: "詹詠翔",
    keycloakSub: null,
  }

  test("keeps the id, email and name the door audit records", () => {
    expect(callerAsUser(caller)).toEqual({
      id: "u1",
      email: "loki@winlab.tw",
      name: "詹詠翔",
      avatarUrl: null,
    })
  })

  test("falls back to the email, then Unknown, like normalizeUser", () => {
    expect(callerAsUser({ ...caller, name: null }).name).toBe("loki@winlab.tw")
    expect(callerAsUser({ ...caller, name: null, email: null }).name).toBe(
      "Unknown"
    )
  })
})
