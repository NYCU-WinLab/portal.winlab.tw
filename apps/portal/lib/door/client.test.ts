import { describe, expect, test } from "bun:test"

import { parseDoorState } from "@/lib/door/client"

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
