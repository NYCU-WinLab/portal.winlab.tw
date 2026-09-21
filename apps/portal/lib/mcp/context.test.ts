import { describe, expect, test } from "bun:test"

import { errorMessage } from "@/lib/mcp/context"

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
