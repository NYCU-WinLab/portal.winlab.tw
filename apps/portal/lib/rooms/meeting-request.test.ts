import { describe, expect, test } from "bun:test"

import {
  bearerToken,
  callbackTokenMatches,
  hashCallbackToken,
  newCallbackToken,
  newRequestId,
} from "./meeting-request"

describe("newRequestId", () => {
  test("is prefixed and unique", () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a).toMatch(/^room-booking-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe("newCallbackToken", () => {
  test("is 32 bytes of hex and unique", () => {
    const a = newCallbackToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(newCallbackToken())
  })
})

describe("callbackTokenMatches", () => {
  test("accepts the token that produced the hash", () => {
    const token = newCallbackToken()
    expect(callbackTokenMatches(token, hashCallbackToken(token))).toBe(true)
  })

  test("rejects a different token", () => {
    expect(
      callbackTokenMatches(newCallbackToken(), hashCallbackToken("other"))
    ).toBe(false)
  })

  test("rejects an empty token", () => {
    expect(callbackTokenMatches("", hashCallbackToken("real"))).toBe(false)
  })

  // A stored hash that isn't hex must not throw out of the request handler —
  // it's a rejected request, not a 500.
  test("rejects a malformed stored hash without throwing", () => {
    expect(callbackTokenMatches("anything", "not-hex")).toBe(false)
    expect(callbackTokenMatches("anything", "")).toBe(false)
  })
})

describe("bearerToken", () => {
  test("extracts the token", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123")
  })

  test("is case-insensitive on the scheme and tolerates padding", () => {
    expect(bearerToken("  bearer   abc123  ")).toBe("abc123")
  })

  test("rejects anything that isn't a bearer header", () => {
    expect(bearerToken("Basic abc123")).toBeNull()
    expect(bearerToken("abc123")).toBeNull()
    expect(bearerToken("Bearer")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })
})
