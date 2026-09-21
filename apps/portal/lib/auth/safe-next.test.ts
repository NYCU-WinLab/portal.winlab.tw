import { describe, expect, test } from "bun:test"

import { loginUrlFor, safeNextPath } from "@/lib/auth/safe-next"

describe("safeNextPath", () => {
  test("keeps same-origin paths with their query string", () => {
    expect(safeNextPath("/oauth/consent?authorization_id=abc")).toBe(
      "/oauth/consent?authorization_id=abc"
    )
  })

  test("falls back for empty, external and protocol-relative targets", () => {
    expect(safeNextPath(null)).toBe("/")
    expect(safeNextPath("")).toBe("/")
    expect(safeNextPath("https://evil.example/")).toBe("/")
    expect(safeNextPath("//evil.example/")).toBe("/")
    expect(safeNextPath("/\\evil.example")).toBe("/")
  })

  test("falls back when control characters could smuggle a host", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/")
    expect(safeNextPath("/\r\n/evil.example")).toBe("/")
    expect(safeNextPath("/receipts\u0000")).toBe("/")
  })

  test("honours a custom fallback", () => {
    expect(safeNextPath("javascript:alert(1)", "/receipts")).toBe("/receipts")
  })
})

describe("loginUrlFor", () => {
  test("omits next when the destination is the home page", () => {
    expect(loginUrlFor("/")).toBe("/auth/login")
  })

  test("encodes the destination into next", () => {
    expect(loginUrlFor("/oauth/consent?authorization_id=a b")).toBe(
      "/auth/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Da%20b"
    )
  })
})
