import { describe, expect, test } from "bun:test"

import { getPolaroidFrame } from "./polaroid-frame"

describe("getPolaroidFrame", () => {
  test("is deterministic for the same id", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    expect(getPolaroidFrame(id)).toEqual(getPolaroidFrame(id))
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
