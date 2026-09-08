import { describe, expect, test } from "bun:test"

import {
  pickRepresentativeCover,
  resolveWallPhotoId,
} from "@/lib/gallery/wall-photo-id"

describe("resolveWallPhotoId", () => {
  test("returns the image id when not in a sequence", () => {
    expect(
      resolveWallPhotoId(
        { id: "solo", sequence_id: null, sequence_index: null },
        []
      )
    ).toBe("solo")
  })

  test("picks the lowest sequence_index sibling as the wall cover", () => {
    const siblings = [
      { id: "b", sequence_id: "seq", sequence_index: 2 },
      { id: "a", sequence_id: "seq", sequence_index: 0 },
      { id: "c", sequence_id: "seq", sequence_index: 1 },
    ] as const
    expect(resolveWallPhotoId(siblings[2]!, siblings)).toBe("a")
  })

  test("accepts readonly sibling arrays", () => {
    const siblings = [
      { id: "cover", sequence_id: "seq", sequence_index: 0 },
      { id: "shot", sequence_id: "seq", sequence_index: 1 },
    ] as const
    expect(resolveWallPhotoId(siblings[1]!, siblings)).toBe("cover")
  })

  test("falls back to id when siblings omit the sequence", () => {
    expect(
      resolveWallPhotoId(
        { id: "orphan", sequence_id: "seq", sequence_index: 3 },
        [{ id: "other", sequence_id: "other-seq", sequence_index: 0 }]
      )
    ).toBe("orphan")
  })
})

describe("pickRepresentativeCover", () => {
  test("returns null for an empty bucket", () => {
    expect(pickRepresentativeCover([])).toBeNull()
  })

  test("picks lowest sequence_index then id", () => {
    const cover = pickRepresentativeCover([
      { id: "z", sequence_id: "seq", sequence_index: 1 },
      { id: "a", sequence_id: "seq", sequence_index: null },
      { id: "m", sequence_id: "seq", sequence_index: 0 },
    ])
    expect(cover?.id).toBe("m")
  })
})
