import { describe, expect, test } from "bun:test"

import { getPolaroidFrame, getPolaroidTape } from "./polaroid-frame"

describe("getPolaroidFrame", () => {
  test("is deterministic for the same id", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    expect(getPolaroidFrame(id)).toEqual(getPolaroidFrame(id))
  })

  test("empty id still returns a frame", () => {
    const frame = getPolaroidFrame("")
    expect(frame.aspectClass.length).toBeGreaterThan(0)
    expect(frame.maxWidthClass.length).toBeGreaterThan(0)
  })

  test("assigns different aspect classes across a sample of ids", () => {
    const ids = [
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "00000000-0000-0000-0000-000000000001",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    ]
    const aspects = new Set(ids.map((id) => getPolaroidFrame(id).aspectClass))
    expect(aspects.size).toBeGreaterThan(1)
  })
})

describe("getPolaroidTape", () => {
  test("is deterministic and only returns known values", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    expect(getPolaroidTape(id)).toBe(getPolaroidTape(id))
    expect(["tl", "tr", "clip", "none"]).toContain(getPolaroidTape(id))
  })

  test("empty id still returns a known tape", () => {
    expect(["tl", "tr", "clip", "none"]).toContain(getPolaroidTape(""))
  })

  test("assigns accents to a majority of a sample of ids", () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `aaaaaaaa-aaaa-aaaa-aaaa-${i.toString(16).padStart(12, "0")}`
    )
    const accented = ids.filter((id) => getPolaroidTape(id) !== "none").length
    expect(accented).toBeGreaterThan(20)
  })
})
