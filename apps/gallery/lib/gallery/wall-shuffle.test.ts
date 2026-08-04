import { describe, expect, test } from "bun:test"

import { shuffleGalleryWallOrder } from "@/lib/gallery/wall-shuffle"

describe("shuffleGalleryWallOrder", () => {
  test("returns a new array of the same length and members", () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffleGalleryWallOrder(input)
    expect(out).not.toBe(input)
    expect(out).toHaveLength(input.length)
    expect([...out].sort()).toEqual([...input].sort())
  })

  test("handles empty and singleton", () => {
    expect(shuffleGalleryWallOrder([])).toEqual([])
    expect(shuffleGalleryWallOrder(["only"])).toEqual(["only"])
  })
})
