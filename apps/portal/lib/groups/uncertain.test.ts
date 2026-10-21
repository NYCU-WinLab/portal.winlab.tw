import { describe, expect, it } from "bun:test"

import { INVALID_INPUT, UNAUTHORIZED } from "./messages"
import { mayHaveLanded, outcomeUncertain } from "./uncertain"

describe("mayHaveLanded", () => {
  it("is false for refusals made before anything was sent", () => {
    expect(mayHaveLanded({ status: "unconfigured" })).toBe(false)
    expect(mayHaveLanded({ status: "error", detail: INVALID_INPUT })).toBe(
      false
    )
    expect(mayHaveLanded({ status: "error", detail: UNAUTHORIZED })).toBe(false)
    expect(
      mayHaveLanded({ status: "forbidden", reason: "denied", detail: "x" })
    ).toBe(false)
    expect(
      mayHaveLanded({ status: "forbidden", reason: "not_managed", detail: "x" })
    ).toBe(false)
    expect(mayHaveLanded({ status: "ok", data: [] })).toBe(false)
  })

  it("is true when Google or the connection failed part-way", () => {
    expect(mayHaveLanded({ status: "error", detail: "處理太久，已停止" })).toBe(
      true
    )
    expect(
      mayHaveLanded({
        status: "forbidden",
        reason: "google_permission",
        detail: "x",
      })
    ).toBe(true)
  })
})

describe("outcomeUncertain", () => {
  it("flags only error", () => {
    expect(outcomeUncertain("error")).toBe(true)
    for (const o of [
      "ok",
      "already",
      "not_found",
      "protected",
      "denied",
    ] as const)
      expect(outcomeUncertain(o)).toBe(false)
  })
})
