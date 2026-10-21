import { describe, expect, it } from "bun:test"

import { mayHaveLanded, outcomeUncertain } from "./uncertain"

describe("mayHaveLanded", () => {
  it("is false for ok, unconfigured and anything the server says was not sent", () => {
    expect(mayHaveLanded({ status: "unconfigured" })).toBe(false)
    expect(mayHaveLanded({ status: "ok", data: [] })).toBe(false)
    expect(
      mayHaveLanded({ status: "error", detail: "any text", sent: false })
    ).toBe(false)
    expect(
      mayHaveLanded({
        status: "forbidden",
        reason: "google_permission",
        detail: "x",
        sent: false,
      })
    ).toBe(false)
    for (const reason of ["denied", "not_managed"] as const)
      expect(mayHaveLanded({ status: "forbidden", reason, detail: "x" })).toBe(
        false
      )
  })

  it("is true when the server says a write was sent, or does not say", () => {
    expect(mayHaveLanded({ status: "error", detail: "x", sent: true })).toBe(
      true
    )
    expect(mayHaveLanded({ status: "error", detail: "x" })).toBe(true)
    expect(
      mayHaveLanded({
        status: "forbidden",
        reason: "google_permission",
        detail: "x",
        sent: true,
      })
    ).toBe(true)
    expect(
      mayHaveLanded({
        status: "forbidden",
        reason: "google_permission",
        detail: "x",
      })
    ).toBe(true)
  })

  it("does not read the message text", () => {
    expect(
      mayHaveLanded({
        status: "error",
        detail: "處理太久，已停止",
        sent: false,
      })
    ).toBe(false)
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
